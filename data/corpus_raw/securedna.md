---
title: "SecureDNA: Cryptographic DNA Synthesis Screening"
source: "SecureDNA Consortium; Carter et al. 2023"
---

SecureDNA is a synthesis screening system designed to provide privacy-preserving sequence screening using cryptographic hashing. Unlike IGSC screening which requires submitting sequences to a central database, SecureDNA allows providers to screen sequences without revealing them to the screening service. The system uses k-mer based hashing to check sequences against a database of controlled sequences. SecureDNA's scope is sequence-level: it detects individual sequences or fragments with homology to regulated pathogens. Limitations shared with all sequence-level screening: it cannot detect workflows that (1) achieve dangerous outcomes without any regulated sequence, (2) combine benign sequences to reconstitute function, or (3) operate entirely through existing biological materials (cell lines, viral stocks) without ordering synthetic DNA. A cloud lab executing a serial passage experiment to evolve transmissibility in an existing H5N1 strain would not trigger SecureDNA screening because no synthetic DNA is ordered. Protocol-level screening addresses this blind spot.
