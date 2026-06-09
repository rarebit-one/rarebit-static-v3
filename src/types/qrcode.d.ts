// Minimal shim — qrcode ships no types and we only use toString at build time.
declare module "qrcode" {
  const QRCode: {
    toString(
      text: string,
      options?: {
        type?: string;
        margin?: number;
        color?: { dark?: string; light?: string };
      }
    ): Promise<string>;
  };
  export default QRCode;
}
