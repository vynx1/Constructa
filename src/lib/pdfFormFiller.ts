// Server-only: fills Cal/OSHA DOSH 41-1 + Construction RFI AcroForms in-process
// (no Python agent-service required).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'

export type ProjectFormData = Record<string, unknown>

export type FilledPdf = {
  filename: string
  contentType: 'application/pdf'
  base64: string
}

const TPL_DIR = join(process.cwd(), 'agent-service/forms/templates')

function g(d: ProjectFormData, ...keys: string[]): string {
  for (const k of keys) {
    const v = d[k]
    if (v !== null && v !== undefined && v !== '') return String(v)
  }
  return ''
}

async function fillTemplate(
  templateFile: string,
  textValues: Record<string, string>,
  checkboxValues: Record<string, boolean>,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(readFileSync(join(TPL_DIR, templateFile)))
  const form = pdf.getForm()

  for (const [name, value] of Object.entries(textValues)) {
    if (!value) continue
    try {
      form.getTextField(name).setText(value)
    } catch {
      /* field absent on this template revision */
    }
  }

  for (const [name, on] of Object.entries(checkboxValues)) {
    try {
      const box = form.getCheckBox(name)
      if (on) box.check()
      else box.uncheck()
    } catch {
      /* field absent */
    }
  }

  form.updateFieldAppearances()
  return pdf.save()
}

function dosh41Fields(p: ProjectFormData) {
  const addr1 = g(p, 'company_address_line1', 'project_address')
  let addr2 = g(p, 'company_address_line2')
  if (!addr2) {
    addr2 = [g(p, 'city'), g(p, 'state'), g(p, 'zip')].filter(Boolean).join(', ')
  }

  const text: Record<string, string> = {
    Employer: g(p, 'company_name', 'employer'),
    'Employers Rep': g(p, 'employer_rep', 'contact_name'),
    'Address 1': addr1,
    'Address 2': addr2,
    'Title  Phone No': [g(p, 'rep_title'), g(p, 'rep_phone', 'phone')].filter(Boolean).join(' / '),
    'State Contractors License No': g(p, 'contractor_license'),
    Phone: g(p, 'phone'),
    FaxEmail: g(p, 'email', 'fax'),
    Type: g(p, 'project_type'),
    Other: g(p, 'project_type_other'),
    'In whose name': g(p, 'project_owner', 'owner_name'),
    Title: g(p, 'signer_title', 'rep_title'),
    Date: g(p, 'date'),
    'Have any permits for any project to be covered by this permit application previously been applied for or obtained':
      g(p, 'prior_permit_detail'),
    'From what district office 1': g(p, 'prior_permit_office'),
    'JV-Details': g(p, 'jv_details'),
  }

  const acts = new Set(
    (Array.isArray(p.osha_activities) ? p.osha_activities : []).map((a) =>
      String(a).toUpperCase(),
    ),
  )
  const cb: Record<string, boolean> = {}
  for (const code of ['T1', 'S4', 'D3', 'SE', 'MD', 'RC', 'CW', 'SF']) {
    cb[`${code}-Annual`] = acts.has(code) && p.permit_kind === 'annual'
  }
  for (const code of ['T1', 'C2', 'D3', 'S4']) {
    cb[`${code}-Project`] = acts.has(code) && p.permit_kind !== 'annual'
  }

  const kind = String(p.permit_kind ?? '').toLowerCase()
  cb['Annual Permit'] = kind === 'annual'
  cb['Project Administrator'] = Boolean(p.is_project_administrator)
  cb['Specialty Contractor'] = Boolean(p.is_specialty_contractor)
  cb['Other Project Related'] = Boolean(p.other_project_related)
  cb['Single/Multiple Project Permit'] = ['project', 'single', 'multiple'].includes(kind)
  cb['Temporary Permit'] = kind === 'temporary'

  const pw = p.public_works
  cb['PublicWorks Yes'] = pw === true
  cb['PublicWorks No'] = pw === false
  const jv = p.joint_venture
  cb['JV-Yes'] = jv === true
  cb['JV-No'] = jv === false
  const prev = p.prior_permit
  cb['PrevObtain-Yes'] = prev === true
  cb['PrevObtain-No'] = prev === false

  return { text, cb }
}

function rfiFields(p: ProjectFormData) {
  let loc = g(p, 'project_address')
  const extra = [g(p, 'city'), g(p, 'state'), g(p, 'zip')].filter(Boolean).join(', ')
  if (extra) loc = loc ? `${loc}, ${extra}` : extra
  if (p.parcel_coords) loc = (loc ? `${loc} | ` : '') + `Parcel: ${p.parcel_coords}`

  const text: Record<string, string> = {
    'PROJECT NAMERow1': g(p, 'project_name'),
    'RFI NUMBERRow1': g(p, 'rfi_number'),
    'PROJECT LOCATIONRow1': loc,
    'PROJECT IDRow1': g(p, 'project_id'),
    'DRAWING IDRow1': g(p, 'drawing_id'),
    'DATE OF REQUESTRow1': g(p, 'rfi_date', 'date'),
    'DEADLINE FOR RESPONSERow1': g(p, 'rfi_deadline'),
    'RFI OVERVIEWRow1': g(p, 'rfi_overview'),
    'SECTIONS REFERENCEDRow1': g(p, 'rfi_sections'),
    'REQUEST  CLARIFICATION REQUIREDRow1': g(p, 'rfi_request'),
    'NAME  TITLE OF REQUESTING PARTYRow1': g(p, 'requestor_name_title', 'contact_name'),
    'DATE OF REQUESTRow1_2': g(p, 'rfi_date', 'date'),
    'REQUESTING PARTY EMAILRow1': g(p, 'requestor_email', 'email'),
    PHONERow1: g(p, 'requestor_phone', 'phone'),
    'COMPANY NAME': g(p, 'company_name'),
    'CONTACT NAME ADDRESS ADDRESS ADDRESS TELEPHONE EMAIL': [
      g(p, 'contact_name'),
      g(p, 'company_address_line1', 'project_address'),
      extra,
      g(p, 'phone'),
      g(p, 'email'),
    ]
      .filter(Boolean)
      .join('\n'),
  }

  return { text, cb: {} as Record<string, boolean> }
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/** Fill both permit PDFs from a plain project dict. */
export async function fillPermitForms(
  project: ProjectFormData,
): Promise<Record<string, FilledPdf>> {
  const dosh = dosh41Fields(project)
  const rfi = rfiFields(project)

  const [doshBytes, rfiBytes] = await Promise.all([
    fillTemplate('dosh41.pdf', dosh.text, dosh.cb),
    fillTemplate('rfi.pdf', rfi.text, rfi.cb),
  ])

  return {
    dosh41: {
      filename: 'DOSH-41-1_filled.pdf',
      contentType: 'application/pdf',
      base64: toBase64(doshBytes),
    },
    rfi: {
      filename: 'Construction-RFI_filled.pdf',
      contentType: 'application/pdf',
      base64: toBase64(rfiBytes),
    },
  }
}
