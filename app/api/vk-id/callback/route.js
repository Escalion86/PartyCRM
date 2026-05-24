export const GET = async () =>
  new Response(
    `<!doctype html>
<html lang="ru">
  <head><meta charset="utf-8" /><title>VK ID</title></head>
  <body>
    <script>
      window.close();
    </script>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  )
