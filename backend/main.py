from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
from typing import Dict, List, Set
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Task(BaseModel):
    id: str
    name: str
    dependencies: List[str]
    description: str

class TaskStatus(BaseModel):
    id: str
    completed: bool
    ready: bool

def load_tasks():
    with open('tasks.json', 'r') as f:
        return json.load(f)

TASKS = load_tasks()

# Mock Awell service - this represents a specific patient's completion state
# In reality, this would be fetched from Awell for a specific patient ID
MOCK_AWELL_COMPLETED_TASKS = [
    "onboarding",
    "parent-interview", 
    "medical-history",
    "developmental-history",
    "adi-r",
    "adaptive-behavior",
    "sensory-profile",
    "behavioral-screening",
    "cognitive-assessment",
    "sleep-assessment",
    "feeding-assessment",
    "motor-skills"
]

# Current patient's completion state (would be fetched/updated from Awell in real implementation)
PATIENT_COMPLETED_TASKS = set()

async def checkTaskOnAwell(task_id: str) -> bool:
    """Mock Awell service call to check if a task is completed for this patient"""
    await asyncio.sleep(0.2)  # Simulate API delay
    return task_id in MOCK_AWELL_COMPLETED_TASKS

def get_ready_tasks(tasks: List[Dict], completed_tasks: Set[str]) -> List[str]:
    ready_tasks = []
    for task in tasks:
        if task["id"] not in completed_tasks:
            dependencies_met = all(dep in completed_tasks for dep in task["dependencies"])
            if dependencies_met:
                ready_tasks.append(task["id"])
    return ready_tasks

@app.get("/")
async def root():
    return {"message": "Hello World"}

@app.get("/tasks")
async def get_tasks():
    return TASKS

@app.get("/task-status")
async def get_task_status():
    status_list = []
    completed_tasks = set(PATIENT_COMPLETED_TASKS)
    ready_tasks = get_ready_tasks(TASKS, completed_tasks)
    
    for task in TASKS:
        status_list.append({
            "id": task["id"],
            "name": task["name"],
            "completed": task["id"] in completed_tasks,
            "ready": task["id"] in ready_tasks,
            "dependencies": task["dependencies"],
            "responsibility": task["responsibility"]
        })
    
    return status_list

@app.post("/complete-task/{task_id}")
async def complete_task(task_id: str):
    global PATIENT_COMPLETED_TASKS
    
    # Check if task exists
    task_exists = any(task["id"] == task_id for task in TASKS)
    if not task_exists:
        return {"error": "Task not found", "task_id": task_id}
    
    # Check if task is ready (all dependencies completed)
    ready_tasks = get_ready_tasks(TASKS, PATIENT_COMPLETED_TASKS)
    if task_id not in ready_tasks and task_id not in PATIENT_COMPLETED_TASKS:
        return {"error": "Task is not ready", "task_id": task_id}
    
    # Mark task as completed for this patient
    if task_id not in PATIENT_COMPLETED_TASKS:
        PATIENT_COMPLETED_TASKS.add(task_id)
        return {
            "message": f"Task {task_id} completed successfully",
            "task_id": task_id,
            "total_completed": len(PATIENT_COMPLETED_TASKS)
        }
    else:
        return {
            "message": f"Task {task_id} was already completed",
            "task_id": task_id,
            "total_completed": len(PATIENT_COMPLETED_TASKS)
        }

@app.post("/reset-patient")
async def reset_patient():
    """Reset patient's completion state - clears all completed tasks"""
    global PATIENT_COMPLETED_TASKS
    previous_count = len(PATIENT_COMPLETED_TASKS)
    previous_tasks = list(PATIENT_COMPLETED_TASKS)
    PATIENT_COMPLETED_TASKS.clear()
    
    # After reset, only tasks with no dependencies should be ready
    ready_tasks = get_ready_tasks(TASKS, PATIENT_COMPLETED_TASKS)
    
    return {
        "message": "Patient state reset successfully",
        "previous_completed": previous_count,
        "previous_tasks": previous_tasks,
        "current_completed": len(PATIENT_COMPLETED_TASKS),
        "ready_tasks": ready_tasks
    }

@app.post("/sync-awell-step")
async def sync_awell_step():
    """Check completion of current ready tasks and return results for one iteration"""
    global PATIENT_COMPLETED_TASKS
    
    ready_tasks = get_ready_tasks(TASKS, PATIENT_COMPLETED_TASKS)
    if not ready_tasks:
        return {
            "completed": False,
            "message": "No ready tasks to check",
            "ready_tasks": [],
            "newly_completed": [],
            "total_completed": len(PATIENT_COMPLETED_TASKS)
        }
    
    newly_completed = []
    for task_id in ready_tasks:
        # Check with Awell service if this task is completed
        is_completed = await checkTaskOnAwell(task_id)
        if is_completed and task_id not in PATIENT_COMPLETED_TASKS:
            PATIENT_COMPLETED_TASKS.add(task_id)
            newly_completed.append(task_id)
    
    # Check if there are more ready tasks after this update
    new_ready_tasks = get_ready_tasks(TASKS, PATIENT_COMPLETED_TASKS)
    has_more = len(new_ready_tasks) > 0
    
    return {
        "completed": not has_more,
        "message": f"Checked {len(ready_tasks)} ready tasks, {len(newly_completed)} newly completed",
        "ready_tasks": ready_tasks,
        "newly_completed": newly_completed,
        "total_completed": len(PATIENT_COMPLETED_TASKS),
        "has_more": has_more,
        "next_ready_tasks": new_ready_tasks
    }

@app.post("/sync-awell")
async def sync_with_awell():
    """Legacy endpoint - sync with Awell service to check completed tasks for this patient"""
    global PATIENT_COMPLETED_TASKS
    newly_completed = []
    
    async def check_ready_tasks_recursive():
        while True:
            ready_tasks = get_ready_tasks(TASKS, PATIENT_COMPLETED_TASKS)
            if not ready_tasks:
                break
                
            tasks_completed_this_round = []
            for task_id in ready_tasks:
                # Check with Awell service if this task is completed
                is_completed = await checkTaskOnAwell(task_id)
                if is_completed and task_id not in PATIENT_COMPLETED_TASKS:
                    PATIENT_COMPLETED_TASKS.add(task_id)
                    tasks_completed_this_round.append(task_id)
                    newly_completed.append(task_id)
            
            if not tasks_completed_this_round:
                break
    
    await check_ready_tasks_recursive()
    
    return {
        "message": "Sync completed",
        "newly_completed": newly_completed,
        "total_completed": len(PATIENT_COMPLETED_TASKS),
        "awell_tasks_available": len(MOCK_AWELL_COMPLETED_TASKS)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)