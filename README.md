# CRM Rhinoboots

CRM interno de Rhinoboots (calzado industrial B2B), con tres pipelines
independientes que comparten la misma base de clientes:

- **Ventas** — proceso comercial estándar
- **Licitaciones** — concursos públicos/privados, con checklist bid/no-bid
- **Recuperación de cartera** — reactivación de cuentas perdidas, con
  prioridad calculada automáticamente

## Tecnologías

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [Supabase](https://supabase.com) (Postgres) como base de datos
- Publicado en [Vercel](https://vercel.com)

## Desarrollo local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Necesitas un archivo
`.env.local` con las variables de `.env.local.example` apuntando a tu
proyecto de Supabase.

## Base de datos

El esquema vive en [`supabase/migrations`](supabase/migrations). Para
aplicar cambios:

```bash
npx supabase login --token <tu-personal-access-token>
npx supabase link --project-ref <project-ref>
npx supabase db push
```
