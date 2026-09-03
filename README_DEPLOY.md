# DESPLIEGUE REAL — SUPABASE + CLOUDFLARE PAGES

Esta versión NO usa localStorage para votos, códigos ni panel.
Todo dato real vive en Supabase.

## 1. Crear Supabase
1. Entra en Supabase y crea un proyecto gratuito.
2. Ve a `SQL Editor`.
3. Abre `supabase-schema.sql`, copia todo y ejecútalo.
4. En `Project Settings > API` copia:
   - Project URL
   - `service_role` key

IMPORTANTE:
La `service_role` key NO está incluida en el HTML ni en app.js.
Solo se configura como secreto del servidor Cloudflare.

## 2. Publicar en Cloudflare Pages
Sube esta carpeta a un repositorio GitHub y crea un proyecto Cloudflare Pages
con ese repositorio.

No necesita build:
- Framework preset: None
- Build command: vacío
- Build output directory: `/` (raíz del proyecto)

Cloudflare detectará automáticamente la carpeta `functions/`.

## 3. Variables de entorno en Cloudflare
En:
`Workers & Pages > tu proyecto > Settings > Variables and Secrets`

Añade:

SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_USER
ADMIN_PASSWORD
SESSION_SECRET

Ejemplo:
ADMIN_USER = admin

Para `ADMIN_PASSWORD`, elige tú una contraseña fuerte.
Para `SESSION_SECRET`, usa una cadena aleatoria larga (32+ caracteres).

Después vuelve a desplegar.

## 4. Prueba
La base de datos crea un código inicial:
`666-333`

Entra en la URL gratuita que Cloudflare te da, por ejemplo:
`https://tu-proyecto.pages.dev`

Vota desde un móvil.

Abre Administración desde otro dispositivo:
- usuario = el valor de ADMIN_USER
- contraseña = el valor de ADMIN_PASSWORD

El voto aparecerá en el panel porque ya está guardado en Supabase.

## 5. Arquitectura

NAVEGADOR
   |
   v
Cloudflare Pages (HTML/CSS/JS)
   |
   v
Cloudflare Pages Functions (/api/*)
   |
   v
Supabase PostgreSQL

La SERVICE_ROLE_KEY nunca sale al navegador.

## Seguridad incluida
- Código de un solo uso.
- Envío de voto atómico en PostgreSQL.
- 5 códigos incorrectos => bloqueo de IP durante 10 minutos.
- Base de datos no accesible directamente desde el navegador.
- RLS activado.
- Login admin mediante cookie HttpOnly firmada.
- SERVICE_ROLE_KEY guardada solo como secreto de Cloudflare.
