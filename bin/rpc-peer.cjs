// Transport-independent peer. Messages must be JSON serializable.
class RpcPeer {
  constructor(send, timeout = 30000) {
    this.send = send
    this.timeout = timeout
    this.methods = new Map()
    this.pending = new Map()
    this.nextId = 0
    this.closed = false
  }

  register(cmd, method) {
    this.methods.set(cmd, method)
    return this
  }

  request(cmd, ...args) {
    if (this.closed) return Promise.reject(new Error('RPC connection is closed'))
    const invocationId = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(invocationId)
        reject(new Error(`RPC request timed out: ${cmd}`))
      }, this.timeout)
      this.pending.set(invocationId, { resolve, reject, timer })
      Promise.resolve()
        .then(() => this.send({ type: 'request', invocationId, cmd, args }))
        .catch(error => {
          const pending = this.pending.get(invocationId)
          if (!pending) return
          clearTimeout(timer)
          this.pending.delete(invocationId)
          reject(error)
        })
    })
  }

  async receive(message) {
    if (this.closed || !message || !Number.isSafeInteger(message.invocationId)) return
    const { type, invocationId } = message
    if (type === 'response') {
      const pending = this.pending.get(invocationId)
      if (!pending) return
      this.pending.delete(invocationId)
      clearTimeout(pending.timer)
      if (message.error) {
        const error = new Error(message.error.message)
        error.name = message.error.name || 'Error'
        if (message.error.stack) error.stack = message.error.stack
        pending.reject(error)
      } else {
        pending.resolve(message.result)
      }
      return
    }
    if (type !== 'request' || typeof message.cmd !== 'string' || !Array.isArray(message.args)) return
    const response = { type: 'response', invocationId }
    try {
      const method = this.methods.get(message.cmd)
      if (!method) throw new Error(`Invalid method: ${message.cmd}`)
      response.result = await method(...message.args)
    } catch (error) {
      response.error = {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    }
    if (!this.closed) {
      try {
        await this.send(response)
      } catch (error) {
        this.close(error)
      }
    }
  }

  close(error = new Error('RPC connection is closed')) {
    this.closed = true
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    this.methods.clear()
  }
}

module.exports = RpcPeer
