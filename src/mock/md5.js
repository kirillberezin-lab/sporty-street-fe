// Tiny MD5 (RFC 1321) so seed ids match java.util.UUID.nameUUIDFromBytes in Node and the browser.
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

/** @returns {Uint8Array} 16-byte digest of the UTF-8 bytes of `text` */
export function md5(text) {
  const msg = new TextEncoder().encode(text)
  const len = ((msg.length + 8) >>> 6) * 64 + 64
  const buf = new Uint8Array(len)
  buf.set(msg)
  buf[msg.length] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(len - 8, (msg.length * 8) >>> 0, true)
  view.setUint32(len - 4, Math.floor(msg.length / 0x20000000), true)
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]
  for (let off = 0; off < len; off += 64) {
    let [a, b, c, d] = [a0, b0, c0, d0]
    for (let i = 0; i < 64; i++) {
      let f, g
      if (i < 16) [f, g] = [(b & c) | (~b & d), i]
      else if (i < 32) [f, g] = [(d & b) | (~d & c), (5 * i + 1) % 16]
      else if (i < 48) [f, g] = [b ^ c ^ d, (3 * i + 5) % 16]
      else [f, g] = [c ^ (b | ~d), (7 * i) % 16]
      const t = d
      d = c
      c = b
      const x = (a + f + K[i] + view.getUint32(off + g * 4, true)) >>> 0
      const s = S[(i >> 4) * 4 + (i % 4)]
      b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0
      a = t
    }
    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }
  const out = new Uint8Array(16)
  const ov = new DataView(out.buffer)
  ;[a0, b0, c0, d0].forEach((w, i) => ov.setUint32(i * 4, w, true))
  return out
}
