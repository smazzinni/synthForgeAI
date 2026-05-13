import { db } from './src/lib/db'

async function seed() {
  // Check if workspace already exists
  const existing = await db.workspace.findFirst()
  if (existing) {
    console.log('Seed data already exists, skipping...')
    return
  }

  const workspace = await db.workspace.create({
    data: {
      name: 'My Workspace',
      slug: 'my-workspace',
      agentInstructions: ''
    }
  })

  const project = await db.project.create({
    data: {
      name: 'Sample Project',
      description: 'Sample project with demo databases',
      workspaceId: workspace.id
    }
  })

  const database = await db.database.create({
    data: {
      name: 'My Database',
      dbType: 'postgresql',
      schemaJson: '{}',
      dataJson: '{}',
      projectId: project.id
    }
  })

  console.log('Seed data created successfully!')
  console.log({ workspaceId: workspace.id, projectId: project.id })
}

seed().catch(console.error)
