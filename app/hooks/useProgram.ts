"use client";

import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "@/lib/constants";
import idl from "@/lib/idl.json";
import type { Solama } from "@/lib/solama";

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const provider = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    return new AnchorProvider(connection, wallet as never, {
      commitment: "confirmed",
    });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new Program<Solama>(idl as never, provider);
  }, [provider]);

  const getGamePDA = (authority: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("game"), authority.toBuffer()],
      PROGRAM_ID
    )[0];

  const getVaultPDA = (authority: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), authority.toBuffer()],
      PROGRAM_ID
    )[0];

  const getBetPDA = (player: PublicKey, roundId: bigint) => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(roundId);
    return PublicKey.findProgramAddressSync(
      [Buffer.from("bet"), player.toBuffer(), buf],
      PROGRAM_ID
    )[0];
  };

  return { program, provider, getGamePDA, getVaultPDA, getBetPDA };
}
