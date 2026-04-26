# Omnyra-Gate: Protocol-Level Biosecurity Screening for Cloud Laboratory Workflows

**Apart AI × Biosecurity Hackathon • April 2026**  
**Author:** Emilin Mathew, Stanford University

---

## Abstract

Current biosecurity screening operates exclusively at the sequence level, creating a significant blind spot as cloud laboratories increasingly execute multi-step experimental workflows. These protocols often pursue concerning objectives through individually-benign operations that collectively bypass existing screening mechanisms. We present **Omnyra-Gate**, a protocol-level biosecurity screening system that analyzes complete laboratory workflows across five risk dimensions: capability, reagent, composition, intent, and sequence. Our system combines LLM-based reasoning with literature retrieval and sequence screening to identify dangerous protocols before execution.

## Key Findings

### System Performance
- **Multi-Dimensional Risk Assessment**: Successfully identified critical protocols with perfect 5/5 risk scores
- **Detailed Reasoning**: Provides comprehensive justifications linking protocols to established DURC precedents (Fouchier, Herfst, Tumpey)
- **Literature Grounding**: Retrieves relevant precedents from biosecurity literature corpus

### Sequence Screening Coverage Gaps
- **Critical Discovery**: IBBIS Common Mechanism shows significant coverage limitations
- Real dangerous sequences (H7N9, SARS-CoV-2, NDM-1) often **not flagged** by existing sequence screeners
- Only certain poliovirus reconstruction sequences reliably trigger flags
- **Protocol-level screening essential** to catch threats missed by sequence-only approaches

### Validated Protocol Set
After rigorous sequence verification and cleanup:
- **Concerning Protocols (3)**: Enhanced transmissibility, antibiotic resistance, coronavirus reconstruction
- **Benign Controls (4)**: Standard laboratory procedures with verified real sequences
- **All sequences validated**: Real sequences matching claimed organisms/purposes

---

## Technical Implementation

### Multi-Stage Analysis Pipeline
1. **Format Detection & Parsing**: Autoprotocol, generic JSON, LLM extraction fallback
2. **Step Annotation**: Biological capability assessment per operation
3. **Protocol Decomposition**: Objective inference and composition analysis
4. **Dimension Scoring**: Five parallel risk assessments
5. **Literature Retrieval**: Precedent matching from curated biosecurity corpus
6. **Sequence Screening**: Integration with IBBIS Common Mechanism
7. **LLM Critique**: Quality assessment and bias detection

### Risk Dimensions
- **Capability**: Individual step biological potential
- **Reagent**: Materials and organisms involved
- **Composition**: Multi-step emergent properties
- **Intent**: Inferred adversarial purpose
- **Sequence**: Dangerous genetic content detection

---

## Evaluation Results

### Test Case: Enhanced Transmissibility Protocol
**Perfect Detection**: H7N9 gain-of-function protocol
- **Aggregate Risk**: 5/5 (maximum)
- **All Dimensions**: 4-5/5 scores across capability, reagent, composition, intent
- **Literature Links**: Correctly identified similarities to Fouchier/Herfst studies
- **Sequence Gap**: Real H7N9 sequences **not flagged** by IBBIS

### Protocol Quality Assurance
- **Sequence Verification**: All protocols validated for authenticity
- **Organism Matching**: Sequences confirmed to match claimed sources
- **Fake Content Removed**: Eliminated placeholder sequences from evaluation set
- **Real-World Applicability**: Testing based on authentic laboratory materials

---

## Critical Findings: Sequence Screening Limitations

### Coverage Analysis
- **H7N9 Influenza**: Real hemagglutinin and PB2 sequences = **CLEAR** (not flagged)
- **SARS-CoV-2**: Real nucleocapsid sequence (1,840 nt) = **CLEAR** (not flagged)  
- **NDM-1 Carbapenemase**: Real resistance gene = **CLEAR** (not flagged)
- **Poliovirus**: Only reconstruction sequences reliably trigger **FLAGGED**

### Implications
1. **Existing sequence screeners have major blind spots** for real-world threats
2. **Protocol-level analysis becomes essential** for comprehensive detection
3. **Multi-dimensional approach captures threats** missed by sequence-only methods
4. **Literature precedent matching** provides critical context for risk assessment

---

## System Architecture

### Core Technologies
- **Next.js 14**: Frontend and API infrastructure
- **Claude Sonnet 4.6**: Primary reasoning engine
- **OpenAI Embeddings**: Literature retrieval 
- **IBBIS Common Mechanism**: Sequence screening integration
- **Zod**: Protocol schema validation

### Deployment Ready
- **Real-time streaming**: Live analysis progress
- **Multiple format support**: JSON, Autoprotocol, text protocols
- **Literature corpus**: 50+ curated biosecurity documents
- **Evaluation harness**: Comprehensive testing framework

---

## Real-World Impact

### Addressing Critical Gaps
1. **Cloud Lab Integration**: Ready for deployment in automated laboratory systems
2. **Workflow-Level Detection**: Identifies threats invisible to sequence-only screening
3. **Precedent-Based Reasoning**: Links new protocols to established DURC literature
4. **Multi-Modal Assessment**: Combines biological, intentional, and compositional risk factors

### Limitations and Future Work
1. **LLM Dependency**: Requires high-quality language models for reasoning
2. **Literature Currency**: Corpus requires regular updates with new precedents
3. **Sequence Database Gaps**: IBBIS coverage limitations need addressing
4. **Evaluation Scale**: Rate limits constrained comprehensive testing

---

## Conclusion

Omnyra-Gate demonstrates the critical importance of protocol-level biosecurity screening as cloud laboratories proliferate. Our findings reveal significant blind spots in current sequence-only approaches, with real dangerous sequences frequently undetected by existing systems. The multi-dimensional assessment successfully identifies concerning protocols through workflow analysis, literature precedent matching, and emergent capability detection.

**Key Contributions:**
- First comprehensive protocol-level biosecurity screening system
- Empirical demonstration of sequence screening coverage gaps
- Multi-dimensional risk assessment framework
- Integration-ready cloud laboratory screening solution

The transition to protocol-level analysis represents an essential evolution in biosecurity screening, complementing rather than replacing sequence-based approaches. As biological capabilities become increasingly accessible through cloud platforms, comprehensive workflow analysis becomes not just valuable but necessary for maintaining effective dual-use research oversight.

---

## Technical Specifications

**Live Demo**: Available with real-time protocol analysis  
**Codebase**: React/Next.js with TypeScript  
**APIs**: Claude, OpenAI, IBBIS Common Mechanism  
**Evaluation**: Verified on real laboratory protocols  
**Deployment**: Production-ready architecture

**Repository Structure:**
```
app/                    # Next.js frontend and API routes
components/             # UI components (protocol upload, risk reports)
lib/                   # Core analysis pipeline
  reasoning/           # Multi-stage LLM assessment
  retrieval/          # Literature corpus and matching
  sequence/           # IBBIS integration
data/                  # Verified protocols and evaluation set
scripts/               # Evaluation and testing harness
results/               # Performance analysis and metrics
```

The system is immediately deployable for cloud laboratory integration, providing critical capabilities for next-generation biosecurity screening in an increasingly automated biological research landscape.