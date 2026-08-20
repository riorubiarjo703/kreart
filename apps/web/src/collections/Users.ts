import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'name', 'role'] },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'content-manager',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Content manager', value: 'content-manager' },
      ],
      admin: { description: 'Admins manage staff and products; content managers edit content.' },
    },
  ],
}
