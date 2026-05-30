import { createDb } from '../../db/index.js'

// postgres connects lazily — this produces a properly-typed Db without an actual connection
export function createFakeDb() {
  return createDb('postgresql://fake:fake@localhost:5432/fake')
}
