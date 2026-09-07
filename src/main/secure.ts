import { safeStorage } from 'electron'

export function encryptKey(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密不可用,无法保存 API-KEY')
  }
  return safeStorage.encryptString(plain).toString('base64')
}

export function decryptKey(encryptedB64: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密不可用,无法读取 API-KEY')
  }
  return safeStorage.decryptString(Buffer.from(encryptedB64, 'base64'))
}
