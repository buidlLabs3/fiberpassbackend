#![no_std]
#![no_main]
#![allow(unexpected_cfgs)]

mod error;
use core::convert::TryInto;

use ckb_std::{
    ckb_constants::Source,
    default_alloc, entry,
    high_level::{load_cell_data, load_cell_lock_hash, load_script, load_witness_args, QueryIter},
};
use error::Error;

entry!(program_entry);
default_alloc!();

const LOCK_ARGS_LEN: usize = 97;
const SCRIPT_VERSION: u8 = 1;

const HASH_LEN: usize = 32;
const MAGIC: &[u8; 4] = b"FPV1";
const DATA_VERSION: u8 = 1;
const VAULT_DATA_LEN: usize = 85;

const ACTION_OWNER_REFUND: u8 = 0;
const ACTION_OPERATOR_PAYOUT: u8 = 1;
const ACTION_OPERATOR_REBALANCE: u8 = 2;

pub fn program_entry() -> i8 {
    match run() {
        Ok(()) => 0,
        Err(error) => error as i8,
    }
}

fn run() -> Result<(), Error> {
    let args = load_vault_args()?;
    let action = load_action()?;
    let state = validate_group_data()?;

    match action {
        ACTION_OWNER_REFUND => {
            if !has_auth_input(&args.owner_lock_hash) {
                return Err(Error::MissingOwnerAuth);
            }
        }
        ACTION_OPERATOR_PAYOUT | ACTION_OPERATOR_REBALANCE => {
            if !has_auth_input(&args.operator_lock_hash) {
                return Err(Error::MissingOperatorAuth);
            }
        }
        _ => return Err(Error::InvalidAction),
    }

    validate_outputs(&state)?;
    Ok(())
}

#[derive(Clone, Copy)]
struct VaultArgs {
    owner_lock_hash: [u8; HASH_LEN],
    operator_lock_hash: [u8; HASH_LEN],
}

#[derive(Clone, Copy)]
struct VaultData {
    account_id_hash: [u8; HASH_LEN],
    nonce: u64,
}

#[derive(Clone, Copy)]
struct GroupState {
    account_id_hash: [u8; HASH_LEN],
    max_nonce: u64,
}

fn load_vault_args() -> Result<VaultArgs, Error> {
    let script = load_script()?;
    let args = script.args().raw_data();
    let bytes = args.as_ref();

    if bytes.len() != LOCK_ARGS_LEN || bytes[0] != SCRIPT_VERSION {
        return Err(Error::InvalidArgs);
    }

    let _vault_id_hash = read_hash(&bytes[1..33])?;
    let owner_lock_hash = read_hash(&bytes[33..65])?;
    let operator_lock_hash = read_hash(&bytes[65..97])?;

    Ok(VaultArgs {
        owner_lock_hash,
        operator_lock_hash,
    })
}

fn load_action() -> Result<u8, Error> {
    let witness_args = load_witness_args(0, Source::GroupInput)?;
    let lock = witness_args.lock().to_opt().ok_or(Error::InvalidWitness)?;
    let bytes = lock.raw_data();
    bytes.first().copied().ok_or(Error::InvalidWitness)
}

fn validate_group_data() -> Result<GroupState, Error> {
    let mut account_id_hash: Option<[u8; HASH_LEN]> = None;
    let mut max_nonce = 0u64;
    let mut seen_input = false;

    for data in QueryIter::new(load_cell_data, Source::GroupInput) {
        seen_input = true;
        let vault_data = parse_vault_data(&data)?;

        match account_id_hash {
            Some(account) if account != vault_data.account_id_hash => {
                return Err(Error::MixedAccount);
            }
            None => account_id_hash = Some(vault_data.account_id_hash),
            _ => {}
        }

        if vault_data.nonce > max_nonce {
            max_nonce = vault_data.nonce;
        }
    }

    if !seen_input {
        return Err(Error::ItemMissing);
    }

    Ok(GroupState {
        account_id_hash: account_id_hash.ok_or(Error::InvalidVaultData)?,
        max_nonce,
    })
}

fn validate_outputs(state: &GroupState) -> Result<(), Error> {
    for data in QueryIter::new(load_cell_data, Source::GroupOutput) {
        let vault_data = parse_vault_data(&data)?;

        if vault_data.account_id_hash != state.account_id_hash {
            return Err(Error::MixedAccount);
        }

        if vault_data.nonce <= state.max_nonce {
            return Err(Error::NonMonotonicNonce);
        }
    }

    Ok(())
}

fn has_auth_input(expected_lock_hash: &[u8; HASH_LEN]) -> bool {
    QueryIter::new(load_cell_lock_hash, Source::Input)
        .any(|lock_hash| lock_hash == *expected_lock_hash)
}

fn parse_vault_data(data: &[u8]) -> Result<VaultData, Error> {
    if data.len() != VAULT_DATA_LEN {
        return Err(Error::InvalidVaultData);
    }

    if &data[0..4] != MAGIC || data[4] != DATA_VERSION {
        return Err(Error::InvalidVaultData);
    }

    let account_id_hash = read_hash(&data[5..37])?;
    let _record_id_hash = read_hash(&data[37..69])?;
    let nonce = read_u64_le(&data[69..77])?;
    let _reserved_minor_units = read_u64_le(&data[77..85])?;

    Ok(VaultData {
        account_id_hash,
        nonce,
    })
}

fn read_hash(bytes: &[u8]) -> Result<[u8; HASH_LEN], Error> {
    bytes.try_into().map_err(|_| Error::Encoding)
}

fn read_u64_le(bytes: &[u8]) -> Result<u64, Error> {
    let array: [u8; 8] = bytes.try_into().map_err(|_| Error::Encoding)?;
    Ok(u64::from_le_bytes(array))
}
