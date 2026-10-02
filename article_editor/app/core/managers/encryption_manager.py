"""Encryption Manager — protect sensitive local / shared data (doc §4, §12).

Targets: local project DB, shared project files, project keys, managed copies.
NOT IMPLEMENTED YET — interface only.
"""


class EncryptionManager:
    def encrypt(self, data, key):
        raise NotImplementedError("encryption is not implemented yet")

    def decrypt(self, blob, key):
        raise NotImplementedError("encryption is not implemented yet")
