
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

function decodeJWT(token: string) {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = Buffer.from(base64, 'base64').toString()
    return JSON.parse(jsonPayload)
  } catch (e) {
    return { error: 'Invalid JWT' }
  }
}

const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (key) {
  console.log('Decoded SERVICE_ROLE_KEY:', decodeJWT(key))
} else {
  console.log('No SERVICE_ROLE_KEY found in env')
}

const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (anon) {
  console.log('Decoded ANON_KEY:', decodeJWT(anon))
}
