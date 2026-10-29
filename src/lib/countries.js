// Country name → ISO code for emoji flags. The API only gives names (countryName).
const ISO = {
  nigeria: 'NG', ghana: 'GH', kenya: 'KE', tanzania: 'TZ', uganda: 'UG', senegal: 'SN', 'ivory coast': 'CI',
  "côte d'ivoire": 'CI', cameroon: 'CM', egypt: 'EG', morocco: 'MA', algeria: 'DZ', tunisia: 'TN', 'south africa': 'ZA',
  mali: 'ML', 'dr congo': 'CD', 'burkina faso': 'BF', guinea: 'GN', gabon: 'GA', zambia: 'ZM', zimbabwe: 'ZW',
  england: 'GB-ENG', scotland: 'GB-SCT', wales: 'GB-WLS', 'northern ireland': 'GB-NIR', ireland: 'IE',
  france: 'FR', spain: 'ES', portugal: 'PT', germany: 'DE', italy: 'IT', netherlands: 'NL', belgium: 'BE',
  switzerland: 'CH', austria: 'AT', norway: 'NO', sweden: 'SE', denmark: 'DK', finland: 'FI', poland: 'PL',
  croatia: 'HR', serbia: 'RS', 'bosnia and herzegovina': 'BA', slovenia: 'SI', slovakia: 'SK', 'czech republic': 'CZ',
  czechia: 'CZ', hungary: 'HU', romania: 'RO', ukraine: 'UA', georgia: 'GE', turkey: 'TR', türkiye: 'TR', greece: 'GR',
  brazil: 'BR', argentina: 'AR', uruguay: 'UY', colombia: 'CO', chile: 'CL', ecuador: 'EC', paraguay: 'PY',
  peru: 'PE', venezuela: 'VE', mexico: 'MX', usa: 'US', 'united states': 'US', canada: 'CA', jamaica: 'JM',
  japan: 'JP', 'south korea': 'KR', korea: 'KR', australia: 'AU', 'saudi arabia': 'SA', iran: 'IR', qatar: 'QA',
}

const SUBDIVISION = { 'GB-ENG': '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', 'GB-SCT': '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', 'GB-WLS': '🏴\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}', 'GB-NIR': '🇬🇧' }

export function flagEmoji(countryName = '') {
  const code = ISO[String(countryName).toLowerCase()]
  if (!code) return '🏳️'
  if (SUBDIVISION[code]) return SUBDIVISION[code]
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}
