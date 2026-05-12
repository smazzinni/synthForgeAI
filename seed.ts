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

  // Create a sample e-commerce database
  const ecommerceDb = await db.database.create({
    data: {
      name: 'E-Commerce',
      dbType: 'postgresql',
      schemaJson: JSON.stringify({
        users: { columns: { id: 'serial', name: 'varchar', email: 'varchar', created_at: 'timestamp' } },
        orders: { columns: { id: 'serial', user_id: 'integer', total: 'decimal', status: 'varchar', created_at: 'timestamp' } },
        products: { columns: { id: 'serial', name: 'varchar', price: 'decimal', category: 'varchar', stock: 'integer' } }
      }),
      projectId: project.id
    }
  })

  // Create a sample healthcare database
  const healthcareDb = await db.database.create({
    data: {
      name: 'Healthcare',
      dbType: 'postgresql',
      schemaJson: JSON.stringify({
        patients: { columns: { id: 'serial', name: 'varchar', dob: 'date', gender: 'varchar', diagnosis_code: 'varchar' } },
        medications: { columns: { id: 'serial', name: 'varchar', dosage: 'varchar', frequency: 'varchar' } },
        prescriptions: { columns: { id: 'serial', patient_id: 'integer', medication_id: 'integer', prescribed_at: 'timestamp' } }
      }),
      projectId: project.id
    }
  })

  // Create a sample SaaS database
  const saasDb = await db.database.create({
    data: {
      name: 'SaaS Platform',
      dbType: 'postgresql',
      schemaJson: JSON.stringify({
        organizations: { columns: { id: 'serial', name: 'varchar', plan: 'varchar', created_at: 'timestamp' } },
        users: { columns: { id: 'serial', org_id: 'integer', email: 'varchar', role: 'varchar' } },
        events: { columns: { id: 'serial', user_id: 'integer', action: 'varchar', timestamp: 'timestamp' } }
      }),
      projectId: project.id
    }
  })

  console.log('Seed data created successfully!')
  console.log({ workspaceId: workspace.id, projectId: project.id })
}

seed().catch(console.error)
