#!/usr/bin/env node
/**
 * Escreve `mobile/.env` com o IP da máquina na rede local.
 *
 * Substitui o `hostname -I`, que só existe no Linux. Roda em qualquer sistema:
 *   npm run dev:api-url [porta]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const porta = process.argv[2] ?? '8000';

function ipLocal() {
  const candidatos = [];
  for (const [nome, enderecos] of Object.entries(os.networkInterfaces())) {
    for (const e of enderecos ?? []) {
      if (e.family !== 'IPv4' || e.internal) continue;
      // Interfaces virtuais (Docker, VPN, VM) não são alcançáveis pelo celular.
      const virtual = /docker|veth|br-|virbr|vmnet|vbox|utun|tun|tap|wsl|loopback/i.test(nome);
      candidatos.push({ ip: e.address, virtual });
    }
  }
  const real = candidatos.find((c) => !c.virtual) ?? candidatos[0];
  return real ? real.ip : null;
}

const ip = ipLocal();
if (!ip) {
  console.error('Nenhuma rede encontrada. Conecte-se ao Wi-Fi ou defina o IP à mão no mobile/.env.');
  process.exit(1);
}

const linha = `EXPO_PUBLIC_API_URL=http://${ip}:${porta}\n`;
fs.writeFileSync(path.join(__dirname, '..', '.env'), linha);
console.log(`mobile/.env atualizado: ${linha.trim()}`);
