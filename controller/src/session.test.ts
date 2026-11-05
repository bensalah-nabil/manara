import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSessionStore } from './session.ts'

function fakeStorage() {
    const data = new Map<string, string>()
    return {
        data,
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
        removeItem: (key: string) => void data.delete(key),
    }
}

test('stores, reads, and clears the token', () => {
    const storage = fakeStorage()
    const store = createSessionStore(storage)
    assert.equal(store.get(), null)
    store.set('abc')
    assert.equal(store.get(), 'abc')
    assert.equal(storage.data.size, 1)
    store.clear()
    assert.equal(store.get(), null)
    assert.equal(storage.data.size, 0)
})

test('a new store reads a token persisted by an earlier page load', () => {
    const storage = fakeStorage()
    createSessionStore(storage).set('abc')
    assert.equal(createSessionStore(storage).get(), 'abc')
})

test('unavailable storage keeps the token in memory and never throws', () => {
    const broken = {
        getItem: () => {
            throw new Error('blocked')
        },
        setItem: () => {
            throw new Error('blocked')
        },
        removeItem: () => {
            throw new Error('blocked')
        },
    }
    const store = createSessionStore(broken)
    assert.equal(store.get(), null)
    store.set('abc')
    assert.equal(store.get(), 'abc')
    store.clear()
    assert.equal(store.get(), null)
})
