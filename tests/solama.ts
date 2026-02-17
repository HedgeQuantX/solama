import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solama } from "../target/types/solama";

describe("solama", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Solama as Program<Solama>;

  it("Is initialized!", async () => {
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
