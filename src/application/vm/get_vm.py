import gdown

url = 'https://drive.google.com/uc?id=1LoR4zu9GZHHIEeMmYaSA1n5eSzXOimkm'
output = 'alpine_VM.qcow2'
gdown.download(url, output, quiet=False)