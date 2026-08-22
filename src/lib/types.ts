/** Estat tal com el calcula la base de dades (columna generada). És l'estat
 * gruixut que fan servir els filtres i les pestanyes; l'estat que es mostra a
 * l'usuari és més detallat i es deriva de les aprovacions (vegeu `lib/status`). */
export type TicketStatus = 'obert' | 'solucio_acordada' | 'a_revisar' | 'resolt'

/** Les tres caselles d'aprovació que tanquen una fitxa. */
export type Actor = 'responsable' | 'tecnics' | 'propietari'

/** Els dos actors que, en lloc d'aprovar, poden demanar que es revisi la feina. */
export type ReviewActor = Exclude<Actor, 'responsable'>

/** Equip que aprova aquella casella a totes les fitxes del seu projecte, no
 * només a les que té assignades. */
export type GlobalTeamRole = 'tecnics' | 'propietaris'

/** El compte. `is_admin` és l'administrador de la instal·lació: l'únic permís
 * que no depèn del projecte. La resta viuen a `ProjectMember`. */
export interface Profile {
  id: string
  email: string
  full_name: string | null
  is_admin: boolean
  created_at: string
}

/** Una obra. El `slug` és el que surt a la URL: /p/mirasol.
 * `image_path` és la foto de portada dins del bucket `project-images`. */
export interface Project {
  id: number
  slug: string
  name: string
  image_path: string | null
  active: boolean
  created_at: string
}

/** Permisos d'una persona DINS d'un projecte. Sense fila no hi té accés. */
export interface ProjectMember {
  project_id: number
  user_id: string
  is_manager: boolean
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

/** Accés a un projecte pre-assignat a una invitació encara pendent. */
export interface InvitationProject {
  email: string
  project_id: number
  is_manager: boolean
  can_create: boolean
  can_edit_all: boolean
}

export interface Team {
  id: number
  project_id: number
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
  project_id: number
  name: string
  sort_order: number
  active: boolean
}

export type WorkType = Zone

export interface TicketListRow {
  id: number
  project_id: number
  project_slug: string
  /** Número dins del projecte: el #001 que es mostra. */
  ref: number
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
  review_tecnics_at: string | null
  review_propietari_at: string | null
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
  /** Id global (únic a tota la base de dades): és el que fan servir els camins
   * de Storage i les taules que hi pengen. El número que es mostra és `ref`. */
  id: number
  project_id: number
  ref: number
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
  review_tecnics_at: string | null
  review_tecnics_by: string | null
  review_propietari_at: string | null
  review_propietari_by: string | null
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
