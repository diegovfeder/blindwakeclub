import { sha256Hex } from "@/lib/hash";

export const WAIVER_VERSION = "waiver-v1.0-ptbr";

export const WAIVER_LEGAL_TEXT_PT_BR = `TERMO DE CIENCIA DE RISCOS E RESPONSABILIDADE - BLIND WAKE CLUB

ADVERTENCIA
O wakeboard e as atividades aquáticas praticadas no Blind Wake Club envolvem riscos inerentes à atividade esportiva e recreativa, podendo resultar em quedas, choques, ferimentos leves ou graves, mesmo quando observadas todas as normas de segurança.
Ao aceitar este termo, o participante declara estar ciente desses riscos e optar por praticar a atividade de forma livre e voluntária.

1. DECLARACAO DO PARTICIPANTE
Declaro que estou no pleno gozo de minhas faculdades físicas e mentais e que recebi as orientações necessárias sobre a prática do wakeboard, regras de segurança e uso correto dos equipamentos.
Comprometo-me a:
- Seguir rigorosamente as instruções da equipe do Blind Wake Club.
- Utilizar obrigatoriamente colete salva-vidas e capacete durante toda a atividade.
- Realizar apenas manobras compatíveis com meu nível técnico.
- Nao colocar em risco minha integridade física, a de outros praticantes ou de terceiros.

2. CIENCIA DOS RISCOS
Declaro ter pleno conhecimento de que o wakeboard e uma atividade que envolve riscos naturais, incluindo lesões corporais, choques, quedas e, em situações extremas, risco à vida.
Estou ciente de que a prática ocorre por minha conta e risco, comprometendo-me a respeitar todas as orientações de segurança fornecidas pelos instrutores.

3. ESTADO DE SAUDE
Declaro que estou em boas condições de saúde, apto(a) para a prática de esportes aquáticos, e que:
- Nao possuo doenças cardíacas, neurológicas, respiratórias ou outras que impeçam a prática.
- Nao faço uso de substâncias ou medicamentos que comprometam meus reflexos.
- Sei nadar.
Comprometo-me a informar imediatamente a equipe qualquer condição que possa afetar minha segurança.

4. RESPONSABILIDADE CIVIL
Reconheco que o Blind Wake Club nao se responsabiliza por acidentes decorrentes:
- Da prática normal do esporte.
- Do descumprimento das normas de segurança.
- De atitudes imprudentes ou negligentes do próprio participante.

5. RESPONSABILIDADE PELOS EQUIPAMENTOS
Responsabilizo-me por quaisquer danos causados aos equipamentos utilizados por mau uso, negligência ou descumprimento das orientações, comprometendo-me a ressarcir o clube em caso de dano ou perda.

6. USO DE IMAGEM
Autorizo, de forma gratuita, o uso da minha imagem, voz e nome pelo Blind Wake Club para fins institucionais, promocionais e de divulgação, em qualquer meio de comunicação, sem limitação de tempo ou território.

7. DISPOSICOES GERAIS
- E fundamental saber nadar.
- Idade mínima para a prática: 6 (seis) anos completos.
- Menores de idade devem ter este termo aceito por seu responsável legal.
- Declaro que li, compreendi e concordo integralmente com este termo.

BLIND WAKE CLUB
Estrada Catarina Taverna dos Santos, nº 1100
Cerne - Campina Grande do Sul - PR`;

export const WAIVER_TEXT_HASH = sha256Hex(WAIVER_LEGAL_TEXT_PT_BR);
