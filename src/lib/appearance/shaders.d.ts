export interface ShaderMetadata {
  name: string
  category: string
  description?: string
  fileName: string
  requiresChild?: boolean
  definition?: unknown
  propsMetadata?: Record<string, unknown>
}