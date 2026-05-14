'use client'

// ─── Animation Variants ────────────────────────────────
export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
}

export const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.08 }
  }
}

export const staggerItem = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 }
}

export const messageSlideIn = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: 'spring' as const, stiffness: 300, damping: 24 }
}

// ─── Gradient background animation keyframes ──────────
export const gradientStyle = `
@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
`

// ─── Schema Templates ─────────────────────────────────
export const schemaTemplates: { name: string; desc: string; schema: Record<string, unknown> }[] = [
  { name: 'E-Commerce', desc: 'Users, Products, Orders', schema: { users: { columns: { id: 'SERIAL', first_name: 'VARCHAR', last_name: 'VARCHAR', email: 'VARCHAR', phone: 'VARCHAR', city: 'VARCHAR', state: 'VARCHAR', created_at: 'TIMESTAMP' } }, products: { columns: { id: 'SERIAL', name: 'VARCHAR', category: 'VARCHAR', price: 'DECIMAL', stock: 'INTEGER', description: 'VARCHAR' } }, orders: { columns: { id: 'SERIAL', user_id: 'INTEGER', product_id: 'INTEGER', quantity: 'INTEGER', total_amount: 'DECIMAL', status: 'VARCHAR', order_date: 'TIMESTAMP' } } } },
  { name: 'Healthcare', desc: 'Patients, Doctors, Appointments', schema: { patients: { columns: { id: 'SERIAL', first_name: 'VARCHAR', last_name: 'VARCHAR', email: 'VARCHAR', age: 'INTEGER', diagnosis: 'VARCHAR', admission_date: 'TIMESTAMP', status: 'VARCHAR' } }, doctors: { columns: { id: 'SERIAL', first_name: 'VARCHAR', last_name: 'VARCHAR', specialty: 'VARCHAR', email: 'VARCHAR' } }, appointments: { columns: { id: 'SERIAL', patient_id: 'INTEGER', doctor_id: 'INTEGER', date: 'TIMESTAMP', notes: 'VARCHAR', status: 'VARCHAR' } } } },
  { name: 'Education', desc: 'Students, Courses, Enrollments', schema: { students: { columns: { id: 'SERIAL', first_name: 'VARCHAR', last_name: 'VARCHAR', email: 'VARCHAR', age: 'INTEGER', enrollment_date: 'TIMESTAMP', status: 'VARCHAR' } }, courses: { columns: { id: 'SERIAL', name: 'VARCHAR', category: 'VARCHAR', credits: 'INTEGER', instructor: 'VARCHAR' } }, enrollments: { columns: { id: 'SERIAL', student_id: 'INTEGER', course_id: 'INTEGER', grade: 'VARCHAR', enrolled_at: 'TIMESTAMP' } } } },
  { name: 'HR/Employee', desc: 'Employees, Departments, Salaries', schema: { employees: { columns: { id: 'SERIAL', first_name: 'VARCHAR', last_name: 'VARCHAR', email: 'VARCHAR', department_id: 'INTEGER', hire_date: 'TIMESTAMP', status: 'VARCHAR' } }, departments: { columns: { id: 'SERIAL', name: 'VARCHAR', budget: 'DECIMAL', location: 'VARCHAR' } }, salaries: { columns: { id: 'SERIAL', employee_id: 'INTEGER', amount: 'DECIMAL', effective_date: 'TIMESTAMP' } } } },
  { name: 'Fintech', desc: 'Accounts, Transactions, Cards', schema: { accounts: { columns: { id: 'SERIAL', holder_name: 'VARCHAR', email: 'VARCHAR', balance: 'DECIMAL', account_type: 'VARCHAR', created_at: 'TIMESTAMP' } }, transactions: { columns: { id: 'SERIAL', account_id: 'INTEGER', amount: 'DECIMAL', type: 'VARCHAR', description: 'VARCHAR', timestamp: 'TIMESTAMP' } }, cards: { columns: { id: 'SERIAL', account_id: 'INTEGER', card_type: 'VARCHAR', limit: 'DECIMAL', expiry: 'VARCHAR', status: 'VARCHAR' } } } },
]
