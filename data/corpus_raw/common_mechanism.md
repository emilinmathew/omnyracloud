---
title: "NTI Common Mechanism for DNA Synthesis Screening"
source: "Nuclear Threat Initiative / IBBIS, 2023"
---

The NTI Common Mechanism (developed by IBBIS, the International Biosecurity and Biosafety Initiative for Science) is an open-source DNA synthesis screening tool designed to complement IGSC screening. It provides a shared database and screening algorithm that any synthesis provider can use to screen customer-submitted sequences. The Common Mechanism checks sequences against a curated database of regulated pathogen sequences and toxin genes using both exact and near-neighbor matching. Key design features: it is intended for use at the point of synthesis order, not during protocol execution; it screens individual sequences, not workflows; and it cannot detect protocol-level evasion strategies such as step composition to avoid synthesis entirely or assembling a functional genome from fragments each individually below the screening threshold. The precomputed cache approach in this screener uses a subset of Common Mechanism results for sequences present in evaluation protocols, loaded as a static JSON file to avoid running live API calls in deployed backend code.
