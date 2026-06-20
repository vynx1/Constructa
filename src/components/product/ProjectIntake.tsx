import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'

// <ProjectIntake> — form -> POST /api/project -> Redis (project:{id}).
export function ProjectIntake() {
  const [description, setDescription] = useState('')

  const create = useMutation({
    mutationFn: async (payload: { description: string }) => {
      const res = await fetch('/api/project', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to create project')
      return res.json() as Promise<{ id: string }>
    },
  })

  return (
    <form
      className="intake"
      onSubmit={(e) => {
        e.preventDefault()
        create.mutate({ description })
      }}
    >
      <label className="intake__field">
        Project description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. 3-story mixed-use building, infill lot, Alameda County"
          rows={4}
        />
      </label>
      <button className="btn btn--primary" type="submit" disabled={create.isPending}>
        {create.isPending ? 'Creating…' : 'Create project'}
      </button>
      {create.data && (
        <p className="intake__result">Project created: {create.data.id}</p>
      )}
    </form>
  )
}
