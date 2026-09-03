VALORA A TU PROFESOR — V7 CLOUDFLARE ONLY

Arquitectura real:

Navegador
   ↓
Cloudflare Pages
   ↓
Pages Functions
   ↓
Cloudflare D1 (binding DB)

NO usa Supabase.
NO usa localStorage como base de datos.
NO necesita tarjeta de crédito dentro de los límites del plan Free.

PASO 1 — YA HECHO
En Cloudflare Pages:
Binding:
  Nombre: DB
  D1 database: valora-db

PASO 2 — CREAR TABLAS
Cloudflare:
Storage & databases
→ D1 SQL Database
→ valora-db
→ Console

Copia TODO el contenido de:
  d1-schema.sql

Pégalo en Console y pulsa Execute.

Esto crea:
- codes
- votes
- code_attempts

Y crea un código inicial:
  666-333

PASO 3 — VARIABLES DEL ADMINISTRADOR
En tu proyecto Pages:
Settings
→ Variables and secrets

Crea estas 3 variables:

ADMIN_USER
Ejemplo:
admin

ADMIN_PASSWORD
Pon una contraseña tuya fuerte.

SESSION_SECRET
Pon una cadena larga aleatoria de al menos 32 caracteres.
Ejemplo de formato:
Kj8!vQ2#fZ91_xP4mL7rT0sW6nC3aB5D

No hace falta compartir estas claves con nadie.

PASO 4 — SUBIR V7 A GITHUB
Sustituye en el repositorio los archivos de la V6 por los de esta V7.
Asegúrate especialmente de subir:

index.html
styles.css
app.js
assets/
functions/
d1-schema.sql

El commit provocará automáticamente un nuevo deploy de Cloudflare.

PASO 5 — PRUEBA REAL
Abre tu URL pages.dev.

Código:
666-333

Haz un voto.

Después entra en Administración con:
- usuario = ADMIN_USER
- contraseña = ADMIN_PASSWORD

El voto debe aparecer en el dashboard y permanecer aunque cambies de
ordenador o móvil porque está almacenado en D1.
