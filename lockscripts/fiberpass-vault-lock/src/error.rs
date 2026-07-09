use ckb_std::error::SysError;

#[repr(i8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    IndexOutOfBound = 1,
    ItemMissing = 2,
    LengthNotEnough = 3,
    Encoding = 4,
    InvalidArgs = 5,
    InvalidWitness = 6,
    InvalidAction = 7,
    MissingOwnerAuth = 8,
    MissingOperatorAuth = 9,
    InvalidVaultData = 10,
    MixedAccount = 11,
    NonMonotonicNonce = 12,
}

impl From<SysError> for Error {
    fn from(error: SysError) -> Self {
        match error {
            SysError::IndexOutOfBound => Error::IndexOutOfBound,
            SysError::ItemMissing => Error::ItemMissing,
            SysError::LengthNotEnough(_) => Error::LengthNotEnough,
            SysError::Encoding => Error::Encoding,
            _ => Error::Encoding,
        }
    }
}
