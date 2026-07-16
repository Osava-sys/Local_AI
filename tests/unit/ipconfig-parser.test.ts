import { describe, expect, it } from 'vitest'
import {
  isIpconfigOutput,
  parseIpconfigOutput,
  summarizeIpconfig,
} from '../../src/shared/observations/ipconfig'

const FRENCH_IPCONFIG = `Configuration IP de Windows

   Nom de l’hôte . . . . . . . . . . : LAPTOP-NEXUS
   Suffixe DNS principal . . . . . . : corp.local
   Type de nœud. . . . . . . . . .  : Mixte

Carte Ethernet Ethernet :

   Statut du média. . . . . . . . . . : Média déconnecté
   Description. . . . . . . . . . . . : Intel(R) Ethernet Controller
   Adresse physique . . . . . . . . . : 18-3D-2D-8E-AA-72
   DHCP activé. . . . . . . . . . . . : Oui

Carte réseau sans fil Wi-Fi :

   Description. . . . . . . . . . . . : Intel(R) Wi-Fi 7 BE200
   Adresse physique . . . . . . . . . : AC-45-EF-F5-12-D9
   DHCP activé. . . . . . . . . . . . : Oui
   Adresse IPv4. . . . . . . . . . . .: 192.168.11.116(préféré)
   Masque de sous-réseau. . . . . . . : 255.255.255.0
   Passerelle par défaut. . . . . . .  : 192.168.11.1
   Serveurs DNS. . . . . . . . . . .  : 192.168.11.1
                                                1.1.1.1`

describe('ipconfig observation parser', () => {
  it('structures French ipconfig output into adapters and high-signal network facts', () => {
    expect(isIpconfigOutput(FRENCH_IPCONFIG)).toBe(true)

    const parsed = parseIpconfigOutput(FRENCH_IPCONFIG)

    expect(parsed.hostName).toBe('LAPTOP-NEXUS')
    expect(parsed.primaryDnsSuffix).toBe('corp.local')
    expect(parsed.adapters).toHaveLength(2)
    expect(parsed.adapters[0]?.status).toBe('disconnected')
    expect(parsed.adapters[1]).toMatchObject({
      status: 'connected',
      ipv4Addresses: ['192.168.11.116'],
      defaultGateways: ['192.168.11.1'],
      dnsServers: ['192.168.11.1', '1.1.1.1'],
    })
  })

  it('produces a compact summary that can be parsed again by the renderer', () => {
    const summary = summarizeIpconfig(parseIpconfigOutput(FRENCH_IPCONFIG))
    const roundTrip = parseIpconfigOutput(summary)

    expect(summary).toContain('Windows network configuration summary: adapters=2 active=1 ipv4=1')
    expect(summary).toContain('Adapter: Carte réseau sans fil Wi-Fi')
    expect(roundTrip.sourceFormat).toBe('nexus-summary')
    expect(roundTrip.hostName).toBe('LAPTOP-NEXUS')
    expect(
      roundTrip.adapters.find((adapter) => adapter.status === 'connected')?.ipv4Addresses
    ).toEqual(['192.168.11.116'])
  })
})
