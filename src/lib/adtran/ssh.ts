// @ts-ignore - library has no bundled types
import { Client } from 'ssh2'
import { log, error as logError } from '@/lib/logger'
import { maskSecret } from '@/lib/secrets'

export type SSHConnectionOptions = {
  host: string
  username: string
  password: string
  port?: number
  enablePassword?: string
  timeoutMs?: number
  retries?: number
}

export type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

export interface SSHSession {
  run(command: string): Promise<CommandResult>
  runPrivileged(command: string): Promise<CommandResult>
  close(): Promise<void>
}

const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_RETRIES = 3
const RETRY_DELAY_MS = 1_000

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function logConnectionAttempt(options: SSHConnectionOptions, attempt: number) {
  log('Attempting Adtran SSH connection', {
    host: options.host,
    port: options.port ?? 22,
    username: options.username,
    attempt,
  })
}

function createExecPromise(client: Client, command: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let resolved = false
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        reject(new Error(`SSH command timed out after ${timeoutMs}ms: ${command}`))
      }
    }, timeoutMs)

    client.exec(command, (err: unknown, stream: any) => {
      if (err) {
        clearTimeout(timer)
        resolved = true
        reject(err)
        return
      }

      let stdout = ''
      let stderr = ''

      stream.on('data', (data: Buffer) => {
        stdout += data.toString('utf8')
      })

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf8')
      })

      stream.on('close', (code: number, signal: string | undefined) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          resolve({ code: code ?? 0, stdout, stderr: signal ? `${stderr}\nSignal: ${signal}` : stderr })
        }
      })

      stream.on('error', (streamError: unknown) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          reject(streamError)
        }
      })
    })
  })
}

function createShellPromise(client: Client, commands: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let resolved = false
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        reject(new Error(`SSH shell timed out after ${timeoutMs}ms for commands: ${commands.join('; ')}`))
      }
    }, timeoutMs)

    client.shell((err: unknown, stream: any) => {
      if (err) {
        clearTimeout(timer)
        resolved = true
        reject(err)
        return
      }

      let stdout = ''
      let stderr = ''

      stream.on('data', (data: Buffer) => {
        stdout += data.toString('utf8')
      })

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf8')
      })

      stream.on('close', () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          resolve({ code: 0, stdout, stderr })
        }
      })

      stream.on('error', (streamErr: unknown) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          reject(streamErr)
        }
      })

      for (const command of commands) {
        if (command.trim().length > 0) {
          stream.write(`${command}\n`)
        }
      }

      stream.end('exit\n')
    })
  })
}

export async function connectSSH(options: SSHConnectionOptions): Promise<SSHSession> {
  const retries = options.retries ?? DEFAULT_RETRIES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  let lastError: unknown

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      logConnectionAttempt(options, attempt)
      const client = await new Promise<Client>((resolve, reject) => {
        const instance = new Client()

        instance
          .on('ready', () => resolve(instance))
          .on('error', (err: unknown) => reject(err))
          .connect({
            host: options.host,
            port: options.port ?? 22,
            username: options.username,
            password: options.password,
            readyTimeout: timeoutMs,
            tryKeyboard: false,
            algorithms: {
              // KEX algorithms (include legacy for older AOS)
              kex: [
                'ecdh-sha2-nistp521',
                'ecdh-sha2-nistp384',
                'ecdh-sha2-nistp256',
                'diffie-hellman-group14-sha256',
                'diffie-hellman-group14-sha1',
                'diffie-hellman-group-exchange-sha1',
                'diffie-hellman-group1-sha1',
              ],
              // Host key algorithms
              serverHostKey: [
                'rsa-sha2-512',
                'rsa-sha2-256',
                'ssh-rsa',
                'ssh-ed25519',
                'ssh-dss',
              ],
              // Ciphers (support older CBC if needed)
              cipher: [
                'aes256-ctr',
                'aes192-ctr',
                'aes128-ctr',
                'aes256-cbc',
                'aes128-cbc',
                '3des-cbc',
              ],
              hmac: [
                'hmac-sha2-512',
                'hmac-sha2-256',
                'hmac-sha1',
              ],
              compress: ['none', 'zlib@openssh.com', 'zlib'],
            },
          })
      })

      const session: SSHSession = {
        async run(command: string) {
          log('Adtran SSH executing command', { command })
          try {
            return await createExecPromise(client, command, timeoutMs)
          } catch (e) {
            const msg = (e as Error)?.message?.toLowerCase?.() || String(e)
            if (msg.includes('unable to exec')) {
              // Fallback for devices that disallow exec; use an interactive shell instead
              return createShellPromise(client, [command], timeoutMs)
            }
            throw e
          }
        },
        async runPrivileged(command: string) {
          if (!options.enablePassword) {
            return session.run(command)
          }

          log('Adtran SSH executing privileged command', {
            command,
            enablePassword: maskSecret(options.enablePassword),
          })

          const commands = ['enable', options.enablePassword, command]
          return createShellPromise(client, commands, timeoutMs)
        },
        async close() {
          client.end()
          await new Promise((resolve) => client.once('close', resolve))
        },
      }

      return session
    } catch (err) {
      lastError = err
      logError('Adtran SSH connection attempt failed', err)
      if (attempt < retries) {
        const jitter = Math.floor(Math.random() * 200)
        await delay(RETRY_DELAY_MS * attempt + jitter)
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to establish Adtran SSH connection')
}
