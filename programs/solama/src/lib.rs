use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("AkxWQaZUi5utcadKd31jUX7psx6NBu9ecH9dssXCJgLf");

#[program]
pub mod solama {
    use super::*;

    /// Initialize the game state and vault
    pub fn initialize(ctx: Context<Initialize>, fee_bps: u16) -> Result<()> {
        let game = &mut ctx.accounts.game;
        game.authority = ctx.accounts.authority.key();
        game.vault = ctx.accounts.vault.key();
        game.fee_bps = fee_bps;
        game.total_rounds = 0;
        game.bump = ctx.bumps.game;
        game.vault_bump = ctx.bumps.vault;
        Ok(())
    }

    /// Player places a bet on 1 or 2 price zones
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        round_id: u64,
        amount: u64,
        zones: Vec<Zone>,
    ) -> Result<()> {
        require!(amount > 0, SolamaError::InvalidAmount);
        require!(
            !zones.is_empty() && zones.len() <= 2,
            SolamaError::InvalidZoneCount
        );

        for zone in &zones {
            require!(
                zone.lower_bound < zone.upper_bound,
                SolamaError::InvalidZoneBounds
            );
            require!(
                zone.multiplier_bps >= 10_000,
                SolamaError::InvalidMultiplier
            );
        }

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        let bet = &mut ctx.accounts.bet;
        bet.player = ctx.accounts.player.key();
        bet.round_id = round_id;
        bet.amount = amount;
        bet.zones = zones;
        bet.status = BetStatus::Pending;
        bet.timestamp = Clock::get()?.unix_timestamp;
        bet.bump = ctx.bumps.bet;

        Ok(())
    }

    /// Resolve a bet — called by the authority/crank with the settled price
    pub fn resolve_bet(ctx: Context<ResolveBet>, settled_price: u64) -> Result<()> {
        let bet = &mut ctx.accounts.bet;
        let game = &ctx.accounts.game;

        require!(
            bet.status == BetStatus::Pending,
            SolamaError::BetAlreadyResolved
        );

        // Extract values before mutating bet to satisfy borrow checker
        let multiplier_hit = bet
            .zones
            .iter()
            .find(|z| settled_price >= z.lower_bound && settled_price <= z.upper_bound)
            .map(|z| z.multiplier_bps);
        let bet_amount = bet.amount;

        bet.settled_price = settled_price;

        match multiplier_hit {
            Some(multiplier_bps) => {
                let gross_payout = bet_amount
                    .checked_mul(multiplier_bps as u64)
                    .ok_or(SolamaError::MathOverflow)?
                    .checked_div(10_000)
                    .ok_or(SolamaError::MathOverflow)?;

                let fee = gross_payout
                    .checked_mul(game.fee_bps as u64)
                    .ok_or(SolamaError::MathOverflow)?
                    .checked_div(10_000)
                    .ok_or(SolamaError::MathOverflow)?;

                let net_payout = gross_payout
                    .checked_sub(fee)
                    .ok_or(SolamaError::MathOverflow)?;

                let vault_balance = ctx.accounts.vault.to_account_info().lamports();
                require!(vault_balance >= net_payout, SolamaError::InsufficientVault);

                **ctx
                    .accounts
                    .vault
                    .to_account_info()
                    .try_borrow_mut_lamports()? -= net_payout;
                **ctx
                    .accounts
                    .player
                    .to_account_info()
                    .try_borrow_mut_lamports()? += net_payout;

                bet.status = BetStatus::Won;
                bet.payout = net_payout;
            }
            None => {
                bet.status = BetStatus::Lost;
                bet.payout = 0;
            }
        }

        Ok(())
    }

    /// Withdraw accumulated fees from the vault (authority only)
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        require!(amount > 0, SolamaError::InvalidAmount);

        let vault_balance = ctx.accounts.vault.to_account_info().lamports();
        require!(vault_balance >= amount, SolamaError::InsufficientVault);

        **ctx
            .accounts
            .vault
            .to_account_info()
            .try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .authority
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        Ok(())
    }
}

// ============================================================
// ACCOUNTS
// ============================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GameState::INIT_SPACE,
        seeds = [b"game", authority.key().as_ref()],
        bump
    )]
    pub game: Account<'info, GameState>,

    /// CHECK: Vault PDA holding SOL — validated by seeds
    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct PlaceBet<'info> {
    #[account(
        seeds = [b"game", game.authority.as_ref()],
        bump = game.bump
    )]
    pub game: Account<'info, GameState>,

    #[account(
        init,
        payer = player,
        space = 8 + Bet::INIT_SPACE,
        seeds = [b"bet", player.key().as_ref(), &round_id.to_le_bytes()],
        bump
    )]
    pub bet: Account<'info, Bet>,

    #[account(
        mut,
        seeds = [b"vault", game.authority.as_ref()],
        bump = game.vault_bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveBet<'info> {
    #[account(
        seeds = [b"game", game.authority.as_ref()],
        bump = game.bump,
        has_one = authority
    )]
    pub game: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [b"bet", bet.player.as_ref(), &bet.round_id.to_le_bytes()],
        bump = bet.bump
    )]
    pub bet: Account<'info, Bet>,

    #[account(
        mut,
        seeds = [b"vault", game.authority.as_ref()],
        bump = game.vault_bump
    )]
    pub vault: SystemAccount<'info>,

    /// CHECK: Player receiving payout — validated by bet.player address constraint
    #[account(mut, address = bet.player)]
    pub player: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        seeds = [b"game", authority.key().as_ref()],
        bump = game.bump,
        has_one = authority
    )]
    pub game: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [b"vault", authority.key().as_ref()],
        bump = game.vault_bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// ============================================================
// STATE
// ============================================================

#[account]
#[derive(InitSpace)]
pub struct GameState {
    pub authority: Pubkey,
    pub vault: Pubkey,
    pub fee_bps: u16,
    pub total_rounds: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub player: Pubkey,
    pub round_id: u64,
    pub amount: u64,
    #[max_len(2)]
    pub zones: Vec<Zone>,
    pub status: BetStatus,
    pub payout: u64,
    pub settled_price: u64,
    pub timestamp: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Zone {
    pub lower_bound: u64,
    pub upper_bound: u64,
    pub multiplier_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum BetStatus {
    Pending,
    Won,
    Lost,
    Cancelled,
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum SolamaError {
    #[msg("Amount must be greater than 0")]
    InvalidAmount,
    #[msg("Must select 1 or 2 zones")]
    InvalidZoneCount,
    #[msg("Zone lower_bound must be less than upper_bound")]
    InvalidZoneBounds,
    #[msg("Multiplier must be >= 10000 (1x)")]
    InvalidMultiplier,
    #[msg("Bet already resolved")]
    BetAlreadyResolved,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Insufficient vault balance for payout")]
    InsufficientVault,
}
