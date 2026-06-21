import { useMutation } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'

type FilledForm = { filename: string; contentType: string; base64: string }
type FormsResponse = { forms: Record<string, FilledForm>; error?: string }

const sampleProject = {
  project_name: 'Harborview Mixed-Use Tower',
  company_name: 'Bayline Construction, Inc.',
  contact_name: 'Marisol Vega',
  employer_rep: 'Marisol Vega',
  rep_title: 'Project Executive',
  signer_title: 'Project Executive',
  project_owner: 'Harborview Development Partners, LLC',
  company_address_line1: '1820 Embarcadero Rd',
  phone: '(510) 555-0142',
  email: 'mvega@bayline.example',
  contractor_license: 'C-9981234',
  project_address: '450 Seaside Blvd',
  city: 'Oakland',
  state: 'CA',
  zip: '94607',
  parcel_coords: '37.7956, -122.2780',
  project_type:
    'New 8-story mixed-use building (commercial + residential), ~96,000 sq ft',
  osha_activities: ['S4', 'T1'],
  permit_kind: 'project',
  public_works: false,
  project_id: 'CNSTR-2026-0451',
  rfi_number: 'RFI-007',
  rfi_date: '2026-06-21',
  date: '2026-06-21',
  rfi_deadline: '2026-06-28',
  drawing_id: 'S-204',
  rfi_overview: 'Clarification on rebar spacing at podium transfer slab.',
  rfi_sections: 'Structural Notes 03 30 00; Detail 5/S-204',
  rfi_request:
    'Drawings S-204 and S-205 show conflicting #8 bar spacing (12" vs 9") at the podium transfer slab. Please confirm governing spacing.',
  requestor_name_title: 'Marisol Vega, Project Executive',
}

const FORM_LABELS: Record<string, string> = {
  dosh41: 'DOSH 41-1',
  rfi: 'Construction RFI',
}

function downloadForm(form: FilledForm) {
  const bytes = Uint8Array.from(atob(form.base64), (ch) => ch.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: form.contentType }))
  const a = document.createElement('a')
  a.href = url
  a.download = form.filename
  a.click()
  URL.revokeObjectURL(url)
}

export function PermitFormsPanel() {
  const fill = useMutation({
    mutationFn: async (): Promise<FormsResponse> => {
      const res = await fetch('/api/agents/forms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: sampleProject }),
      })
      const data = (await res.json()) as FormsResponse
      if (!res.ok) throw new Error(data.error ?? 'PDF generation failed')
      return data
    },
  })

  const forms = fill.data?.forms ?? {}
  const hasForms = Object.keys(forms).length > 0

  return (
    <div className="workspace-forms">
      <button
        type="button"
        className="btn btn--primary workspace-forms__run"
        onClick={() => fill.mutate()}
        disabled={fill.isPending}
      >
        {fill.isPending ? (
          <>
            <Loader2 size={14} className="spin" /> Filling…
          </>
        ) : (
          'Auto fill permit forms'
        )}
      </button>

      {fill.isError && (
        <p className="workspace-forms__error">Couldn&apos;t fill forms — try again.</p>
      )}

      {hasForms && (
        <ul className="workspace-forms__list">
          {Object.entries(forms).map(([key, form]) => (
            <li key={key} className="workspace-forms__item">
              <span className="workspace-forms__label">{FORM_LABELS[key] ?? key}</span>
              <button
                type="button"
                className="workspace-forms__download"
                onClick={() => downloadForm(form)}
                aria-label={`Download ${FORM_LABELS[key] ?? form.filename}`}
              >
                <Download size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
