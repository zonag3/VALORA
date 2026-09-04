VALORA V10 — SEGURIDAD REFORZADA + CÓDIGOS V10

SEGURIDAD POR IP
----------------
La base NO guarda la IP en claro. Guarda un hash HMAC derivado de la IP con SESSION_SECRET.

Cada ciclo son 3 códigos incorrectos consecutivos:

Ciclo 1 -> bloqueo 1 hora
Ciclo 2 -> bloqueo 2 horas
Ciclo 3 -> bloqueo 3 horas
Ciclo 4 -> bloqueo 4 horas
Ciclo 5 -> bloqueo 5 horas
Ciclo 6 -> bloqueo 6 horas y, al terminar esas 6 horas, esa IP queda bloqueada permanentemente.

Un código válido rompe la racha de fallos consecutivos, pero conserva el nivel de reincidencia acumulado.

IMPORTANTE: un bloqueo por IP puede afectar a varias personas si comparten una misma IP pública
(por ejemplo, academia, colegio, oficina o Wi-Fi común).

CÓDIGOS V10
-----------
Código de control reservado:
333-666

- Está protegido.
- Nunca puede borrarse.
- El administrador sí puede bloquearlo y desbloquearlo.
- Al cambiar la encuesta activa, el código de control pasa a la nueva encuesta.

Códigos normales generados automáticamente:

Primer bloque: ABA
- Primer y tercer dígito iguales.
- Segundo dígito diferente.
Ejemplos válidos: 121, 404, 787.

Segundo bloque: CDE
- Los tres dígitos son distintos entre sí.
Ejemplos válidos: 583, 907, 214.

Ejemplo completo: 121-583

Todos los dígitos se eligen criptográficamente y de forma aleatoria entre:
0 1 2 3 4 5 6 7 8 9

333-666 es una excepción reservada y nunca la genera el sistema.

ADMINISTRACIÓN DE CÓDIGOS
-------------------------
Desde el back office cada código puede:
- Bloquearse.
- Desbloquearse.
- Borrarse, incluso si fue usado. Al borrarlo se eliminan también sus respuestas asociadas.
- Excepción: 333-666 jamás puede borrarse.

Los estados verde / amarillo / rojo de V9 se mantienen.
Un código bloqueado muestra además una etiqueta oscura "Bloqueado".

MIGRACIÓN
---------
Si tu instalación actual es V8 o V9:

1. Cloudflare -> D1 -> valora-db -> Console
2. Abre MIGRACION_V8_V9_A_V10.sql
3. Copia TODO y pulsa Execute
4. Después sube los archivos V10 a GitHub
5. Cloudflare Pages hará el nuevo deploy

No cambies:
DB -> valora-db
ADMIN_USER
ADMIN_PASSWORD
SESSION_SECRET

NOTA DE SEGURIDAD
-----------------
El patrón ABA-CDE tiene 64.800 combinaciones posibles:
90 posibilidades para ABA x 720 posibilidades para CDE.

Por tanto, esta estructura tiene menos entropía que seis dígitos completamente aleatorios.
La defensa principal frente a fuerza bruta es el bloqueo progresivo por intentos.
