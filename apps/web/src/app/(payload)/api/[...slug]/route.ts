/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from '@payload-config'
import { REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST } from '@payloadcms/next/routes'

type ParamsPromise = {
  params: Promise<{
    slug: string[]
  }>
}
const TURNSTILE_PROTECTED_SLUGS = ['form-submissions']

const turnstileProtectedRoute =
  (routeHandler: (req: Request, params: ParamsPromise) => Promise<Response>) =>
  async (req: Request, params: ParamsPromise) => {
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
      const { slug } = await params.params
      if (TURNSTILE_PROTECTED_SLUGS.includes(slug[0])) {
        const turnstileToken = req.headers.get('cf-turnstile-token')
        if (!turnstileToken) {
          console.error('No turnstile token provided')
          return new Response(
            JSON.stringify({
              errors: [
                {
                  message:
                    'Bot protection could not verify that you are a real human. Turnstile token is required.',
                },
              ],
              status: 400,
            }),
            { status: 400 },
          )
        }
        const turnstileResponse = await fetch(
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              secret: process.env.NEXT_PRIVATE_TURNSTILE_SECRET_KEY,
              response: turnstileToken,
            }),
          },
        )
        const data = await turnstileResponse.json()
        if (!data.success) {
          console.error('Turnstile token is invalid', data)
          return new Response(
            JSON.stringify({
              errors: [
                {
                  message:
                    'Bot protection could not verify that you are a real human. Turnstile token is invalid',
                },
              ],
              status: 400,
            }),
            { status: 400 },
          )
        }
      }
    }
    return routeHandler(req, params)
  }

export const GET = REST_GET(config)
export const OPTIONS = REST_OPTIONS(config)
export const POST = turnstileProtectedRoute(REST_POST(config))
export const DELETE = REST_DELETE(config)
export const PATCH = REST_PATCH(config)
