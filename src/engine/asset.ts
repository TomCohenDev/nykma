/** The URL of a file under public/: `asset("ads/smoke/blip.wav")`. */
export const asset = (src: string) => "/" + src.replace(/^\/+/, "");
