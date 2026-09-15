const fs = require('fs');

try {
  const rawCookies = JSON.parse(fs.readFileSync('cookies.json', 'utf8'));

  const formattedCookies = rawCookies.map(cookie => {
    // Normalize sameSite values for Playwright
    let sameSite = 'None';
    if (cookie.sameSite) {
      const val = cookie.sameSite.toLowerCase();
      if (val === 'lax') sameSite = 'Lax';
      if (val === 'strict') sameSite = 'Strict';
      if (val === 'no_restriction' || val === 'none') sameSite = 'None';
    }

    return {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      expires: cookie.expirationDate ? Math.floor(cookie.expirationDate) : -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: Boolean(cookie.secure),
      sameSite: sameSite
    };
  });

  const authState = {
    cookies: formattedCookies,
    origins: []
  };

  fs.writeFileSync('auth-state.json', JSON.stringify(authState, null, 2));
  console.log('Successfully generated auth-state.json from Opera cookies!');
} catch (err) {
  console.error('Failed to convert cookies:', err.message);
}