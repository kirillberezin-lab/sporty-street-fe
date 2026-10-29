// Minimal IndexedDB queue shared by the service worker and the app:
// the SW stores pushes that arrive while the app is closed, the app moves them into its inbox.
const DB = 'sporty-street'
const STORE = 'pending-alerts'

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function queueAlert(alert) {
  const db = await open()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(alert)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function drainAlerts() {
  if (typeof indexedDB === 'undefined') return []
  const db = await open()
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.getAll()
    req.onsuccess = () => {
      store.clear()
      resolve(req.result ?? [])
    }
    req.onerror = () => reject(req.error)
  })
  db.close()
  return items
}
