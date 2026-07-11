#![no_std]
#![no_main]
#![allow(unexpected_cfgs)]

mod error;

use core::convert::TryInto;
use ckb_std::{
    ckb_constants::{CellField, Source},
    default_alloc,
    entry,
    syscalls,
};
use ckb_std::error::SysError;
use error::Error;

entry!(program_entry);
default_alloc!();

const LOCK_ARGS_LEN: usize = 97;
const SCRIPT_VERSION: u8 = 1;
const HASH_LEN: usize = 32;
const MAGIC: &[u8; 4] = b"FPV1";
const DATA_VERSION: u8 = 1;
const VAULT_DATA_LEN: usize = 85;
const SCRIPT_BUF_LEN: usize = 180;
const WITNESS_BUF_LEN: usize = 128;

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
    let state = validate_group_data(&args)?;

    match action {
        ACTION_OWNER_REFUND => {
            if !has_auth_input(&args.owner_lock_hash)? {
                return Err(Error::MissingOwnerAuth);
            }
        }
        ACTION_OPERATOR_PAYOUT | ACTION_OPERATOR_REBALANCE => {
            if !has_auth_input(&args.operator_lock_hash)? {
                return Err(Error::MissingOperatorAuth);
            }
        }
        _ => return Err(Error::InvalidAction),
    }

    validate_outputs(&args, &state)?;
    Ok(())
}

#[derive(Clone, Copy)]
struct VaultArgs {
    vault_id_hash: [u8; HASH_LEN],
    owner_lock_hash: [u8; HASH_LEN],
    operator_lock_hash: [u8; HASH_LEN],
}

#[derive(Clone, Copy)]
struct VaultData {
    vault_id_hash: [u8; HASH_LEN],
    nonce: u64,
}

#[derive(Clone, Copy)]
struct GroupState {
    max_nonce: u64,
}

enum LoadedVaultData {
    Missing,
    Empty,
    Data(VaultData),
}

fn load_vault_args() -> Result<VaultArgs, Error> {
    let mut buf = [0u8; SCRIPT_BUF_LEN];
    let len = syscalls::load_script(&mut buf, 0)?;
    if len > buf.len() {
        return Err(Error::LengthNotEnough);
    }

    let script = &buf[..len];
    let args = script_args(script)?;
    if args.len() != LOCK_ARGS_LEN || args[0] != SCRIPT_VERSION {
        return Err(Error::InvalidArgs);
    }

    Ok(VaultArgs {
        vault_id_hash: read_hash(&args[1..33])?,
        owner_lock_hash: read_hash(&args[33..65])?,
        operator_lock_hash: read_hash(&args[65..97])?,
    })
}

fn load_action() -> Result<u8, Error> {
    let mut buf = [0u8; WITNESS_BUF_LEN];
    let len = syscalls::load_witness(&mut buf, 0, 0, Source::GroupInput)?;
    if len > buf.len() {
        return Err(Error::LengthNotEnough);
    }
    witness_lock_first_byte(&buf[..len]).ok_or(Error::InvalidWitness)
}

fn validate_group_data(args: &VaultArgs) -> Result<GroupState, Error> {
    let mut max_nonce = 0u64;
    let mut seen_input = false;
    let mut index = 0usize;

    loop {
        match load_vault_data(index, Source::GroupInput)? {
            LoadedVaultData::Data(vault_data) => {
                seen_input = true;
                if vault_data.vault_id_hash != args.vault_id_hash {
                    return Err(Error::MixedAccount);
                }
                if vault_data.nonce > max_nonce {
                    max_nonce = vault_data.nonce;
                }
            }
            LoadedVaultData::Empty => {
                seen_input = true;
            }
            LoadedVaultData::Missing => break,
        }
        index += 1;
    }

    if !seen_input {
        return Err(Error::ItemMissing);
    }

    Ok(GroupState { max_nonce })
}

fn validate_outputs(args: &VaultArgs, state: &GroupState) -> Result<(), Error> {
    let mut index = 0usize;
    loop {
        match load_vault_data(index, Source::GroupOutput)? {
            LoadedVaultData::Data(vault_data) => {
                if vault_data.vault_id_hash != args.vault_id_hash {
                    return Err(Error::MixedAccount);
                }
                if vault_data.nonce <= state.max_nonce {
                    return Err(Error::NonMonotonicNonce);
                }
            }
            LoadedVaultData::Empty => {}
            LoadedVaultData::Missing => break,
        }
        index += 1;
    }
    Ok(())
}

fn load_vault_data(index: usize, source: Source) -> Result<LoadedVaultData, Error> {
    let mut buf = [0u8; VAULT_DATA_LEN];
    match syscalls::load_cell_data(&mut buf, 0, index, source) {
        Ok(0) => Ok(LoadedVaultData::Empty),
        Ok(len) if len == VAULT_DATA_LEN => Ok(LoadedVaultData::Data(parse_vault_data(&buf)?)),
        Ok(len) if len < VAULT_DATA_LEN => Err(Error::InvalidVaultData),
        Ok(_) => Err(Error::LengthNotEnough),
        Err(SysError::IndexOutOfBound) => Ok(LoadedVaultData::Missing),
        Err(err) => Err(err.into()),
    }
}

fn has_auth_input(expected_lock_hash: &[u8; HASH_LEN]) -> Result<bool, Error> {
    let mut index = 0usize;
    loop {
        let mut hash = [0u8; HASH_LEN];
        match syscalls::load_cell_by_field(&mut hash, 0, index, Source::Input, CellField::LockHash) {
            Ok(len) if len == HASH_LEN => {
                if hash == *expected_lock_hash {
                    return Ok(true);
                }
            }
            Ok(_) => return Err(Error::LengthNotEnough),
            Err(SysError::IndexOutOfBound) => return Ok(false),
            Err(err) => return Err(err.into()),
        }
        index += 1;
    }
}

fn parse_vault_data(data: &[u8; VAULT_DATA_LEN]) -> Result<VaultData, Error> {
    if &data[0..4] != MAGIC || data[4] != DATA_VERSION {
        return Err(Error::InvalidVaultData);
    }

    Ok(VaultData {
        vault_id_hash: read_hash(&data[5..37])?,
        nonce: read_u64_le(&data[69..77])?,
    })
}

fn script_args(script: &[u8]) -> Result<&[u8], Error> {
    if script.len() < 16 {
        return Err(Error::Encoding);
    }
    let total_size = read_u32_le(&script[0..4])? as usize;
    if total_size != script.len() {
        return Err(Error::Encoding);
    }
    let args_offset = read_u32_le(&script[12..16])? as usize;
    if args_offset + 4 > script.len() {
        return Err(Error::Encoding);
    }
    let args_len = read_u32_le(&script[args_offset..args_offset + 4])? as usize;
    let args_start = args_offset + 4;
    let args_end = args_start.checked_add(args_len).ok_or(Error::Encoding)?;
    if args_end > script.len() {
        return Err(Error::Encoding);
    }
    Ok(&script[args_start..args_end])
}

fn witness_lock_first_byte(witness: &[u8]) -> Option<u8> {
    if witness.len() < 16 {
        return None;
    }
    let total_size = read_u32_le(&witness[0..4]).ok()? as usize;
    if total_size != witness.len() {
        return None;
    }
    let lock_offset = read_u32_le(&witness[4..8]).ok()? as usize;
    let input_type_offset = read_u32_le(&witness[8..12]).ok()? as usize;
    if lock_offset == input_type_offset || lock_offset + 4 > witness.len() {
        return None;
    }
    let lock_len = read_u32_le(&witness[lock_offset..lock_offset + 4]).ok()? as usize;
    if lock_len == 0 || lock_offset + 4 + lock_len > witness.len() {
        return None;
    }
    Some(witness[lock_offset + 4])
}

fn read_hash(bytes: &[u8]) -> Result<[u8; HASH_LEN], Error> {
    bytes.try_into().map_err(|_| Error::Encoding)
}

fn read_u64_le(bytes: &[u8]) -> Result<u64, Error> {
    let array: [u8; 8] = bytes.try_into().map_err(|_| Error::Encoding)?;
    Ok(u64::from_le_bytes(array))
}

fn read_u32_le(bytes: &[u8]) -> Result<u32, Error> {
    let array: [u8; 4] = bytes.try_into().map_err(|_| Error::Encoding)?;
    Ok(u32::from_le_bytes(array))
}
