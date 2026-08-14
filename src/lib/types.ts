/** Estat tal com el calcula la base de dades (columna generada). És l'estat
 * gruixut que fan servir els filtres i les pestanyes; l'estat que es mostra a
 * l'usuari és més detallat i es deriva de les aprovacions (vegeu `lib/status`). */
export type TicketStatus = 'obert' | 'solucio_acordada' | 'resolt'

/** Les tres caselles d'aprovació que tanquen una fitxa. */
export type Actor = 'responsable' | 'tecnics' | 'propietari'

/** Equip global que aprova aquella casella arreu, no només a les fitxes assignades. */
export type GlobalTeamRole = 'tecnics' | 'propietaris'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  is_admin: boolean
  can_create: boolean
  can_edit_all: boolean
  created_at: string
}

export interface Invitation {
  email: string
  is_admin: boolean
  note: string | null
  invited_by: string | null
  created_at: string
  accepted_at: string | null
  accepted_by: string | null
}

export interface Team {
  id: number
  name: string
  global_role: GlobalTeamRole | null
  created_at: string
}

/** Equip amb la llista d'ids de membres (per calcular permisos i per l'admin). */
export interface TeamWithMembers extends Team {
  member_ids: string[]
}

export interface Zone {
  id: number
  name: string
  sort_order: number
  active: boolean
}

export type WorkType = Zone

export interface TicketListRow {
  id: number
  title: string
  description: string | null
  status: TicketStatus
  zone_id: number | null
  zone_name: string | null
  work_type_id: number | null
  work_type_name: string | null
  agreed_solution: string | null
  approved_responsable_at: string | null
  approved_tecnics_at: string | null
  approved_propietari_at: string | null
  due_date: string | null
  resolved_at: string | null
  assignee_id: string | null
  assignee_name: string | null
  assignee_email: string | null
  assignee_team_id: number | null
  assignee_team_name: string | null
  created_at: string
  updated_at: string
  comment_count: number
}

export interface Ticket {
  id: number
  title: string
  description: string | null
  status: TicketStatus
  zone_id: number | null
  work_type_id: number | null
  agreed_solution: string | null
  approved_responsable_at: string | null
  approved_responsable_by: string | null
  approved_tecnics_at: string | null
  approved_tecnics_by: string | null
  approved_propietari_at: string | null
  approved_propietari_by: string | null
  due_date: string | null
  resolved_at: string | null
  assignee_id: string | null
  assignee_team_id: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CommentImage {
  id: string
  comment_id: string
  storage_path: string
  created_at: string
}

/** Els dos camps de la fitxa que poden tenir imatges adjuntes. */
export type TicketImageField = 'description' | 'agreed_solution'

export interface TicketFieldImage {
  id: string
  ticket_id: number
  field: TicketImageField
  storage_path: string
  created_at: string
}

export interface Comment {
  id: string
  ticket_id: number
  author_id: string
  body: string | null
  created_at: string
  comment_images: CommentImage[]
}
