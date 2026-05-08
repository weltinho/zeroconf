/**
 * ============================================
 * MOCK DE ORDENS PARA DESENVOLVIMENTO
 * ============================================
 * 
 * Este arquivo simula ordens Boltz e Bitrefill para testar
 * a UI sem precisar do backend.
 * 
 * Para DESATIVAR: mude USE_ORDER_MOCKS para false
 * Para REMOVER: delete este arquivo e remova o import em ClientAreaPage.tsx
 */

// =============================================
// CONFIGURAÇÃO - MUDE PARA false ANTES DE PRODUÇÃO
// =============================================
export const USE_ORDER_MOCKS = false;

// Tempo em ms entre cada mudança de estado (para simular progressão)
const STATE_TRANSITION_DELAY = 4000;

// =============================================
// TIPOS (espelham os do ClientAreaPage)
// =============================================

export type MockOrderStatus = 
  | "awaiting_deposit"
  | "deposit_detected"
  | "confirming"
  | "processing"
  | "paid_out"
  | "completed"
  | "error";

export type MockBoltzStatus =
  | "awaiting_deposit"
  | "deposit_detected"
  | "lockup_pending"
  | "provider_claim_pending"
  | "paid_out"
  | "error";

export interface MockBitrefillOrder {
  order_id: number;
  status: MockOrderStatus;
  deposit_btc_address: string;
  required_deposit_sats: number;
  output_sats: number;
  destination_btc_address: string;
  payout_txid: string | null;
  last_rpc_status: string | null;
  provider: "bitrefill";
  bitrefill_gift_card_line: string | null;
}

export interface MockBoltzOrder {
  order_id: number;
  status: MockBoltzStatus;
  boltz_swap_id: string;
  our_deposit_address: string | null;
  deposit_btc_address: string;
  required_deposit_sats: number;
  expected_onchain_amount_sat: number;
  status_raw: string | null;
  deposit_tx_id: string | null;
  lockup_tx_id: string | null;
  preimage: string | null;
}

// =============================================
// ESTADOS E TRANSIÇÕES
// =============================================

const BITREFILL_STATUS_FLOW: MockOrderStatus[] = [
  "awaiting_deposit",
  "deposit_detected", 
  "confirming",
  "processing",
  "paid_out",
];

const BOLTZ_STATUS_FLOW: MockBoltzStatus[] = [
  "awaiting_deposit",
  "deposit_detected",
  "lockup_pending",
  "provider_claim_pending",
  "paid_out",
];

// =============================================
// GERADORES DE MOCK
// =============================================

function generateMockBtcAddress(): string {
  const chars = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  let addr = "tb1q";
  for (let i = 0; i < 38; i++) {
    addr += chars[Math.floor(Math.random() * chars.length)];
  }
  return addr;
}

function generateMockTxId(): string {
  const hex = "0123456789abcdef";
  let txid = "";
  for (let i = 0; i < 64; i++) {
    txid += hex[Math.floor(Math.random() * hex.length)];
  }
  return txid;
}

function generateMockSwapId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function generateMockPreimage(): string {
  const hex = "0123456789abcdef";
  let preimage = "";
  for (let i = 0; i < 64; i++) {
    preimage += hex[Math.floor(Math.random() * hex.length)];
  }
  return preimage;
}

// =============================================
// CLASSE DE SIMULAÇÃO DE ORDEM
// =============================================

class MockOrderSimulator {
  private bitrefillOrder: MockBitrefillOrder | null = null;
  private boltzOrder: MockBoltzOrder | null = null;
  private listeners: Set<() => void> = new Set();
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private currentStepIndex = 0;

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  // Cria ordem Bitrefill mock
  createBitrefillOrder(productName: string, packageValue: string): MockBitrefillOrder {
    this.reset();
    
    const requiredSats = 50000 + Math.floor(Math.random() * 100000);
    const outputSats = Math.floor(requiredSats * 0.97); // ~3% fee

    this.bitrefillOrder = {
      order_id: 1000 + Math.floor(Math.random() * 9000),
      status: "awaiting_deposit",
      deposit_btc_address: generateMockBtcAddress(),
      required_deposit_sats: requiredSats,
      output_sats: outputSats,
      destination_btc_address: generateMockBtcAddress(),
      payout_txid: null,
      last_rpc_status: null,
      provider: "bitrefill",
      bitrefill_gift_card_line: null,
    };

    this.currentStepIndex = 0;
    this.startProgressSimulation("bitrefill");
    this.notify();

    return this.bitrefillOrder;
  }

  // Cria ordem Boltz mock
  createBoltzOrder(invoice: string): MockBoltzOrder {
    this.reset();

    const requiredSats = 25000 + Math.floor(Math.random() * 75000);

    this.boltzOrder = {
      order_id: 2000 + Math.floor(Math.random() * 8000),
      status: "awaiting_deposit",
      boltz_swap_id: generateMockSwapId(),
      our_deposit_address: generateMockBtcAddress(),
      deposit_btc_address: generateMockBtcAddress(),
      required_deposit_sats: requiredSats,
      expected_onchain_amount_sat: requiredSats,
      status_raw: "swap.created",
      deposit_tx_id: null,
      lockup_tx_id: null,
      preimage: null,
    };

    this.currentStepIndex = 0;
    this.startProgressSimulation("boltz");
    this.notify();

    return this.boltzOrder;
  }

  // Simula progressão de estados
  private startProgressSimulation(type: "bitrefill" | "boltz") {
    if (this.timerId) {
      clearTimeout(this.timerId);
    }

    const advanceState = () => {
      if (type === "bitrefill" && this.bitrefillOrder) {
        this.currentStepIndex++;
        if (this.currentStepIndex < BITREFILL_STATUS_FLOW.length) {
          this.bitrefillOrder.status = BITREFILL_STATUS_FLOW[this.currentStepIndex];
          
          // Adiciona dados conforme avança
          if (this.bitrefillOrder.status === "paid_out") {
            this.bitrefillOrder.payout_txid = generateMockTxId();
            this.bitrefillOrder.bitrefill_gift_card_line = "XXXX-XXXX-XXXX-" + Math.random().toString(36).substring(2, 6).toUpperCase();
          }
          
          this.notify();
          
          if (this.currentStepIndex < BITREFILL_STATUS_FLOW.length - 1) {
            this.timerId = setTimeout(advanceState, STATE_TRANSITION_DELAY);
          }
        }
      } else if (type === "boltz" && this.boltzOrder) {
        this.currentStepIndex++;
        if (this.currentStepIndex < BOLTZ_STATUS_FLOW.length) {
          this.boltzOrder.status = BOLTZ_STATUS_FLOW[this.currentStepIndex];
          
          // Adiciona dados conforme avança
          if (this.boltzOrder.status === "deposit_detected") {
            this.boltzOrder.deposit_tx_id = generateMockTxId();
            this.boltzOrder.status_raw = "transaction.mempool";
          }
          if (this.boltzOrder.status === "lockup_pending") {
            this.boltzOrder.lockup_tx_id = generateMockTxId();
            this.boltzOrder.status_raw = "transaction.confirmed";
          }
          if (this.boltzOrder.status === "provider_claim_pending") {
            this.boltzOrder.status_raw = "transaction.claim.pending";
          }
          if (this.boltzOrder.status === "paid_out") {
            this.boltzOrder.preimage = generateMockPreimage();
            this.boltzOrder.status_raw = "swap.completed";
          }
          
          this.notify();
          
          if (this.currentStepIndex < BOLTZ_STATUS_FLOW.length - 1) {
            this.timerId = setTimeout(advanceState, STATE_TRANSITION_DELAY);
          }
        }
      }
    };

    // Inicia após delay inicial (simula tempo de detecção de depósito)
    this.timerId = setTimeout(advanceState, STATE_TRANSITION_DELAY);
  }

  getBitrefillOrder(): MockBitrefillOrder | null {
    return this.bitrefillOrder;
  }

  getBoltzOrder(): MockBoltzOrder | null {
    return this.boltzOrder;
  }

  reset() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.bitrefillOrder = null;
    this.boltzOrder = null;
    this.currentStepIndex = 0;
    this.notify();
  }

  // Força um estado específico (para teste)
  forceState(type: "bitrefill" | "boltz", status: string) {
    if (type === "bitrefill" && this.bitrefillOrder) {
      this.bitrefillOrder.status = status as MockOrderStatus;
      this.notify();
    } else if (type === "boltz" && this.boltzOrder) {
      this.boltzOrder.status = status as MockBoltzStatus;
      this.notify();
    }
  }

  // Força erro (para teste)
  forceError(type: "bitrefill" | "boltz") {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (type === "bitrefill" && this.bitrefillOrder) {
      this.bitrefillOrder.status = "error";
      this.bitrefillOrder.last_rpc_status = "Erro simulado para teste";
      this.notify();
    } else if (type === "boltz" && this.boltzOrder) {
      this.boltzOrder.status = "error";
      this.boltzOrder.status_raw = "swap.error";
      this.notify();
    }
  }
}

// Singleton
export const mockOrderSimulator = new MockOrderSimulator();

// =============================================
// HOOKS PARA USO EM COMPONENTES
// =============================================

import { useEffect, useState, useCallback } from "react";

export function useMockOrders() {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!USE_ORDER_MOCKS) return;
    
    const unsubscribe = mockOrderSimulator.subscribe(() => {
      setTick((t) => t + 1);
    });
    
    return unsubscribe;
  }, []);

  const createBitrefillOrder = useCallback((productName: string, packageValue: string) => {
    return mockOrderSimulator.createBitrefillOrder(productName, packageValue);
  }, []);

  const createBoltzOrder = useCallback((invoice: string) => {
    return mockOrderSimulator.createBoltzOrder(invoice);
  }, []);

  const reset = useCallback(() => {
    mockOrderSimulator.reset();
  }, []);

  const forceError = useCallback((type: "bitrefill" | "boltz") => {
    mockOrderSimulator.forceError(type);
  }, []);

  return {
    bitrefillOrder: mockOrderSimulator.getBitrefillOrder(),
    boltzOrder: mockOrderSimulator.getBoltzOrder(),
    createBitrefillOrder,
    createBoltzOrder,
    reset,
    forceError,
  };
}
