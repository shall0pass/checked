import { createRouter } from '@nanostores/router'

const routes = {
  main: '/main',
  staples: '/common',
  list: '/list/:id',
  settings: '/settings'
} as const

export const router = createRouter(routes)

export type RouteName = keyof typeof routes
