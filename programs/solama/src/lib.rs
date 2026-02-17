use anchor_lang::prelude::*;

declare_id!("H6UZFdyiBBGGwNpJP6WJU3frJPNgrUeGuFitXRDsQ4iP");

#[program]
pub mod solama {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
