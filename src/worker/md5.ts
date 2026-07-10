// 轻量 MD5 实现 (Public Domain)
export function md5(str: string): string {
  function rotateLeft(x: number, n: number): number {
    return (x << n) | (x >>> (32 - n));
  }
  function addUnsigned(x: number, y: number): number {
    return ((x >>> 0) + (y >>> 0)) >>> 0;
  }

  const hexChars = '0123456789abcdef';
  function toHex(arr: number[]): string {
    let result = '';
    for (let i = 0; i < arr.length; i++) {
      let n = arr[i];
      for (let j = 0; j < 4; j++) {
        result += hexChars[(n >> (j * 8 + 4)) & 0x0F] + hexChars[(n >> (j * 8)) & 0x0F];
      }
    }
    return result;
  }

  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xff);
  }
  const msgLen = bytes.length;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  const bitLen = msgLen * 8;
  for (let i = 0; i < 4; i++) {
    bytes.push((bitLen >>> (i * 8)) & 0xff);
  }
  for (let i = 0; i < 4; i++) {
    bytes.push((bitLen / Math.pow(2, 32)) >>> (i * 8) & 0xff);
  }

  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
             5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
             4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
             6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];

  const K: number[] = [];
  for (let i = 0; i < 64; i++) {
    K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));
  }

  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words.push(bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
  }

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let block = 0; block < words.length; block += 16) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      const temp = D;
      D = C;
      C = B;
      B = addUnsigned(B, rotateLeft(addUnsigned(addUnsigned(A, F), addUnsigned(K[i], words[block + g])), S[i]));
      A = temp;
    }
    a0 = addUnsigned(a0, A);
    b0 = addUnsigned(b0, B);
    c0 = addUnsigned(c0, C);
    d0 = addUnsigned(d0, D);
  }

  return toHex([a0, b0, c0, d0]);
}
