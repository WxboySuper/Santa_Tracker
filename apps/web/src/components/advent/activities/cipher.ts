import { parseCipher } from "@/lib/cipher";
import { defineActivity } from "./activity";
import { CipherActivity } from "./cipher-component";

export const cipherActivity = defineActivity({ id: "cipher", parse: parseCipher, Component: CipherActivity });
