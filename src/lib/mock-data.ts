// Mock data for dev mode when Supabase tables aren't set up yet

export const mockUser = {
  id: 'dev-user-id',
  email: 'demo@synthforge.ai',
  full_name: 'Demo User',
  avatar_url: null,
  role: 'owner',
}

export const mockOrganizations = [
  {
    id: 'org-1',
    name: 'Demo Organization',
    slug: 'demo-org',
    role: 'owner',
    plan: 'pro',
    description: 'Demo organization for testing',
    logo_url: null,
  },
]

export const mockWorkspaces = [
  {
    id: 'ws-1',
    organization_id: 'org-1',
    name: 'Default Workspace',
    slug: 'default-workspace',
    description: 'Default workspace for demo',
    settings: {},
  },
]

export const mockProjects = [
  {
    id: 'proj-1',
    workspace_id: 'ws-1',
    name: 'E-Commerce Database',
    description: 'Synthetic e-commerce database with customers, orders, and products',
    settings: {},
  },
  {
    id: 'proj-2',
    workspace_id: 'ws-1',
    name: 'Healthcare Records',
    description: 'HIPAA-compliant synthetic patient records',
    settings: {},
  },
  {
    id: 'proj-3',
    workspace_id: 'ws-1',
    name: 'Financial Transactions',
    description: 'Synthetic financial transaction data for testing',
    settings: {},
  },
]

export const mockDatabases = [
  {
    id: 'db-1',
    project_id: 'proj-1',
    name: 'E-Commerce DB',
    db_type: 'postgresql',
    status: 'ready',
    row_count: 10000,
    quality_score: 0.95,
    schema_json: [
      { name: 'users', columns: [
        { name: 'id', type: 'uuid', primary: true },
        { name: 'email', type: 'varchar(255)', nullable: false },
        { name: 'full_name', type: 'varchar(255)' },
        { name: 'created_at', type: 'timestamp' },
      ]},
      { name: 'orders', columns: [
        { name: 'id', type: 'uuid', primary: true },
        { name: 'user_id', type: 'uuid', foreignKey: 'users.id' },
        { name: 'total', type: 'decimal(10,2)' },
        { name: 'status', type: 'varchar(50)' },
        { name: 'created_at', type: 'timestamp' },
      ]},
      { name: 'products', columns: [
        { name: 'id', type: 'uuid', primary: true },
        { name: 'name', type: 'varchar(255)' },
        { name: 'price', type: 'decimal(10,2)' },
        { name: 'category', type: 'varchar(100)' },
      ]},
    ],
    data_json: {},
  },
  {
    id: 'db-2',
    project_id: 'proj-2',
    name: 'Healthcare DB',
    db_type: 'postgresql',
    status: 'ready',
    row_count: 5000,
    quality_score: 0.92,
    schema_json: [
      { name: 'patients', columns: [
        { name: 'id', type: 'uuid', primary: true },
        { name: 'name', type: 'varchar(255)' },
        { name: 'date_of_birth', type: 'date' },
        { name: 'gender', type: 'varchar(20)' },
      ]},
    ],
    data_json: {},
  },
  {
    id: 'db-3',
    project_id: 'proj-3',
    name: 'Financial DB',
    db_type: 'postgresql',
    status: 'generating',
    row_count: 0,
    quality_score: null,
    schema_json: [],
    data_json: {},
  },
]

export const mockConversations = [
  {
    id: 'conv-1',
    database_id: 'db-1',
    workspace_id: 'ws-1',
    title: 'E-Commerce Schema Design',
    agent_mode: 'auto',
    status: 'active',
  },
]

export const mockStats = {
  totalDatabases: 3,
  datasetsGenerated: 12,
  qualityScore: 94,
  activeConversations: 2,
}

export const mockApiKeys = [
  {
    id: 'key-1',
    name: 'Production API Key',
    key_prefix: 'sf_prod_',
    permissions: ['read', 'write'],
    last_used_at: '2026-05-13T10:30:00Z',
    created_at: '2026-01-15T08:00:00Z',
  },
  {
    id: 'key-2',
    name: 'Development Key',
    key_prefix: 'sf_dev_',
    permissions: ['read'],
    last_used_at: '2026-05-12T14:20:00Z',
    created_at: '2026-03-01T12:00:00Z',
  },
]

export const mockOrgMembers = [
  { id: 'mem-1', user_id: 'dev-user-id', role: 'owner', email: 'demo@synthforge.ai', full_name: 'Demo User' },
  { id: 'mem-2', user_id: 'user-2', role: 'admin', email: 'alice@example.com', full_name: 'Alice Johnson' },
  { id: 'mem-3', user_id: 'user-3', role: 'member', email: 'bob@example.com', full_name: 'Bob Smith' },
]
