import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'

// <RFIPanel> — question -> cited draft answer (Redis vector RAG + Claude),
// inline at any step (POST /api/agents/rfi).
export function RFIPanel({ step }: { step: number }) {
  const [question, setQuestion] = useState('')

  const ask = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch('/api/agents/rfi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q, step }),
      })
      if (!res.ok) throw new Error('RFI request failed')
      return res.json() as Promise<{ answer: string }>
    },
  })

  return (
    <section className="panel panel--rfi">
      <h4>RFI Resolution</h4>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (question.trim()) ask.mutate(question)
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this step…"
        />
        <button className="btn btn--ghost" disabled={ask.isPending}>
          {ask.isPending ? 'Asking…' : 'Ask'}
        </button>
      </form>
      {ask.data && <p className="panel__answer">{ask.data.answer}</p>}
    </section>
  )
}
