# Scrappy Dog Manager

Aplicación de gestión y seguimiento de grooming sincronizada con Supabase.

## Requisitos

- Proyecto Supabase con las migraciones 01–10 aplicadas.
- Un usuario de Supabase Auth con correo y contraseña.
- Project URL y Publishable Key. Nunca uses una secret key ni `service_role` en esta aplicación.

## Configuración local

1. Copia `config/supabase-config.example.js` como `config/supabase-config.js`.
2. Completa `supabaseUrl` y `supabasePublishableKey`.
3. El archivo real está incluido en `.gitignore` y no debe subirse a GitHub.

## Netlify conectado a GitHub

En **Site configuration → Environment variables**, crea:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

`netlify.toml` ejecuta `scripts/generate-config.mjs` durante el build y genera el archivo de configuración que recibe el navegador. La Publishable Key es una credencial pública para aplicaciones cliente; el acceso real está protegido por Auth y RLS.

## Primer uso

1. Crea o confirma un usuario mediante Supabase Auth.
2. Inicia sesión en la aplicación.
3. Si el usuario no pertenece a un negocio, la aplicación llamará a `create_business()` y creará el flujo estándar.
4. Si encuentra datos de la versión local anterior, ofrecerá migrarlos una sola vez sin borrar el respaldo original.

## Mejoras de esta versión
- Se conserva todo lo incluido en v2.
- Ficha completa de clientes.
- WhatsApp, identificación y contacto de emergencia.
- Ficha completa de mascotas.
- Foto desde cámara o galería.
- Color, microchip, esterilización y preferencias de corte.
- Vacunas con fecha aplicada, vencimiento y veterinaria.
- Alertas de vacunas próximas a vencer.
- Historial de servicios.
- Copia de seguridad y restauración.

## Publicación desde Android
1. Descarga y descomprime el ZIP.
2. En Netlify Drop selecciona la carpeta `scrappy_dog_manager_v2_1`.
3. Pulsa Deploy.
4. Abre el enlace generado.
5. En Chrome: menú > Agregar a pantalla principal / Instalar aplicación.

Los datos operativos se guardan en Supabase y se sincronizan entre dispositivos. `localStorage` se utiliza únicamente para detectar el respaldo antiguo y asignar un identificador al dispositivo.
