import { useState, useEffect, useCallback } from 'react'
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './App.css'

interface Task {
  id: string
  name: string
  dependencies: string[]
  description: string
}

interface TaskStatus {
  id: string
  name: string
  completed: boolean
  ready: boolean
  dependencies: string[]
  responsibility: 'provider' | 'other'
}

// Dynamic API base URL - uses /api for production (Render) and localhost:8000 for development
const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:8000' 
  : '/api'

function App() {
  const [, setTasks] = useState<Task[]>([])
  const [taskStatuses, setTaskStatuses] = useState<TaskStatus[]>([])
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [isLoading, setIsLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<string>('')

  const fetchTasks = async () => {
    try {
      const response = await fetch(`${API_BASE}/tasks`)
      const data = await response.json()
      setTasks(data)
    } catch (error) {
      console.error('Error fetching tasks:', error)
    }
  }

  const fetchTaskStatuses = async () => {
    try {
      const response = await fetch(`${API_BASE}/task-status`)
      const data = await response.json()
      setTaskStatuses(data)
    } catch (error) {
      console.error('Error fetching task statuses:', error)
    }
  }

  const completeTask = async (taskId: string) => {
    try {
      const response = await fetch(`${API_BASE}/complete-task/${taskId}`, {
        method: 'POST',
      })
      const data = await response.json()
      if (data.error) {
        setSyncResult(`Error: ${data.error}`)
      } else {
        setSyncResult(`Task completed: ${taskId}`)
        await fetchTaskStatuses()
      }
    } catch (error) {
      console.error('Error completing task:', error)
      setSyncResult('Error completing task')
    }
  }

  const resetPatient = async () => {
    try {
      const response = await fetch(`${API_BASE}/reset-patient`, {
        method: 'POST',
      })
      const data = await response.json()
      setSyncResult(`Patient reset! Cleared ${data.previous_completed} completed tasks. Ready tasks: ${data.ready_tasks.join(', ')}`)
      await fetchTaskStatuses()
    } catch (error) {
      console.error('Error resetting patient:', error)
      setSyncResult('Error resetting patient')
    }
  }

  const syncWithAwell = async () => {
    setIsLoading(true)
    setSyncResult('Starting sync with Awell...')
    
    try {
      let allCompleted: string[] = []
      let stepCount = 1
      
      while (true) {
        setSyncResult(`Sync step ${stepCount}: Checking ready tasks...`)
        
        const response = await fetch(`${API_BASE}/sync-awell-step`, {
          method: 'POST',
        })
        const data = await response.json()
        
        if (data.newly_completed.length > 0) {
          allCompleted.push(...data.newly_completed)
          setSyncResult(`Step ${stepCount}: Completed ${data.newly_completed.join(', ')}. Updating UI...`)
          
          // Update UI to show the newly completed tasks
          await fetchTaskStatuses()
          
          // Small delay to show the visual update
          await new Promise(resolve => setTimeout(resolve, 1000))
        } else {
          setSyncResult(`Step ${stepCount}: No new completions found. Sync finished.`)
          break // Stop if no new tasks were completed by Awell
        }
        
        // Check if there are more ready tasks after this completion
        if (!data.has_more) {
          setSyncResult(`Step ${stepCount}: No more ready tasks. Sync completed.`)
          break
        }
        
        stepCount++
        
        if (data.next_ready_tasks.length > 0) {
          setSyncResult(`Step ${stepCount}: New ready tasks unlocked: ${data.next_ready_tasks.join(', ')}`)
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
      
      setSyncResult(`Sync completed! Total new tasks completed: ${allCompleted.length} (${allCompleted.join(', ')})`)
      
    } catch (error) {
      console.error('Error syncing with Awell:', error)
      setSyncResult('Error syncing with Awell')
    } finally {
      setIsLoading(false)
    }
  }

  const onNodeClick = useCallback((_: any, node: any) => {
    const task = taskStatuses.find(t => t.id === node.id)
    if (task && task.ready && !task.completed) {
      completeTask(task.id)
    }
  }, [taskStatuses, completeTask])

  const createFlowData = useCallback(() => {
    if (!taskStatuses.length) return

    const nodeMap = new Map()
    const edgeList: Edge[] = []

    // Calculate hierarchical positions
    const getNodeLevel = (taskId: string, visited = new Set()): number => {
      if (visited.has(taskId)) return 0
      visited.add(taskId)
      
      const task = taskStatuses.find(t => t.id === taskId)
      if (!task || task.dependencies.length === 0) return 0
      
      return Math.max(...task.dependencies.map(dep => getNodeLevel(dep, new Set(visited)))) + 1
    }

    // Group tasks by level
    const tasksByLevel: { [level: number]: TaskStatus[] } = {}
    taskStatuses.forEach(task => {
      const level = getNodeLevel(task.id)
      if (!tasksByLevel[level]) tasksByLevel[level] = []
      tasksByLevel[level].push(task)
    })

    // Create nodes with hierarchical positioning
    Object.keys(tasksByLevel).forEach(levelStr => {
      const level = parseInt(levelStr)
      const tasksAtLevel = tasksByLevel[level]
      
      tasksAtLevel.forEach((task, index) => {
        const x = (index - tasksAtLevel.length / 2) * 280 + 600
        const y = level * 200 + 100

        nodeMap.set(task.id, {
          id: task.id,
          type: 'default',
          position: { x, y },
          data: {
            label: (
              <div style={{ textAlign: 'center', padding: '10px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '6px' }}>{task.name}</div>
                <div style={{ 
                  fontSize: '10px', 
                  padding: '4px 8px', 
                  borderRadius: '6px', 
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  border: '1px solid rgba(0,0,0,0.1)'
                }}>
                  {task.completed ? '✅ Complete' : task.ready ? '🟡 Ready (Click)' : '⏳ Waiting'}
                  <br />
                  <span style={{ fontSize: '8px', opacity: 0.7 }}>
                    {task.responsibility === 'provider' ? '👨‍⚕️ Provider' : '👥 Other'}
                  </span>
                </div>
              </div>
            )
          },
          style: {
            background: task.completed ? '#28a745' : task.ready ? '#ffc107' : '#dc3545',
            color: task.completed ? 'white' : task.ready ? 'black' : 'white',
            border: task.ready && !task.completed ? '3px solid #007bff' : '2px solid transparent',
            borderRadius: '15px',
            width: 240,
            height: 100,
            fontSize: '12px',
            boxShadow: '0 6px 12px rgba(0,0,0,0.15)',
            cursor: task.ready && !task.completed ? 'pointer' : 'default',
            opacity: task.responsibility === 'other' ? 0.5 : 1
          }
        })
      })
    })

    // Create edges for dependencies
    taskStatuses.forEach((task) => {
      task.dependencies.forEach((depId) => {
        edgeList.push({
          id: `${depId}-${task.id}`,
          source: depId,
          target: task.id,
          type: 'smoothstep',
          style: { stroke: '#666', strokeWidth: 2 }
        })
      })
    })

    setNodes(Array.from(nodeMap.values()) as any)
    setEdges(edgeList as any)
  }, [taskStatuses, setNodes, setEdges])

  useEffect(() => {
    fetchTasks()
    fetchTaskStatuses()
  }, [])

  useEffect(() => {
    createFlowData()
  }, [createFlowData])

  return (
    <div style={{ height: '100vh', display: 'flex' }}>
      <div className="react-flow-container" style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 50 }}
          attributionPosition="bottom-left"
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          minZoom={0.3}
          maxZoom={2}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      
      <div style={{ 
        width: '300px', 
        padding: '20px', 
        borderLeft: '1px solid #ccc',
        backgroundColor: '#f8f9fa'
      }}>
        <h2>Control Panel</h2>
        
        <button 
          onClick={syncWithAwell}
          disabled={isLoading}
          style={{
            padding: '12px 24px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            width: '100%',
            marginBottom: '10px'
          }}
        >
          {isLoading ? 'Syncing...' : 'Sync with Awell'}
        </button>

        <button 
          onClick={resetPatient}
          disabled={isLoading}
          style={{
            padding: '12px 24px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            width: '100%',
            marginBottom: '20px'
          }}
        >
          Reset Patient
        </button>

        {syncResult && (
          <div style={{
            padding: '10px',
            backgroundColor: '#d4edda',
            border: '1px solid #c3e6cb',
            borderRadius: '4px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            {syncResult}
          </div>
        )}

        <div>
          <h3>Task Summary</h3>
          <div style={{ marginBottom: '10px' }}>
            <strong>Total Tasks:</strong> {taskStatuses.length}
          </div>
          <div style={{ marginBottom: '10px' }}>
            <strong>Completed:</strong> {taskStatuses.filter(t => t.completed).length}
          </div>
          <div style={{ marginBottom: '10px' }}>
            <strong>Ready:</strong> {taskStatuses.filter(t => t.ready && !t.completed).length}
          </div>
          <div style={{ marginBottom: '10px' }}>
            <strong>Waiting:</strong> {taskStatuses.filter(t => !t.ready && !t.completed).length}
          </div>
        </div>

        <div style={{ marginTop: '20px' }}>
          <h4>Ready Provider Tasks</h4>
          {taskStatuses.filter(t => t.ready && !t.completed && t.responsibility === 'provider').map(task => (
            <div key={task.id} style={{
              padding: '8px',
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              marginBottom: '5px',
              fontSize: '12px',
              cursor: 'pointer'
            }}
            onClick={() => completeTask(task.id)}>
              {task.name}
              <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px' }}>
                👨‍⚕️ Click to complete
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
