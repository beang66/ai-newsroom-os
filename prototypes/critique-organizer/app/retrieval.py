"""Replace this adapter with the team's RAG; keep the Candidate contract."""
import re
from .contracts import Candidate

PARTICLES = ('에서는','으로는','에서','에게','으로','까지','부터','은','는','이','가','을','를','의','와','과','도','에')
STOP = {'그리고','하지만','따라서','있다','했다','한다','것이다'}


def query_tokens(query):
    tokens=[]
    for token in re.findall(r'[가-힣A-Za-z0-9]+',query.lower()):
        if len(token)<2 or token in STOP:
            continue
        normalized=token
        if re.fullmatch(r'[가-힣]+',token):
            for suffix in PARTICLES:
                if token.endswith(suffix) and len(token)-len(suffix)>=2:
                    normalized=token[:-len(suffix)]
                    break
        if normalized not in tokens:
            tokens.append(normalized)
    return tokens


class LocalKeywordRetriever:
    """A bounded local lexical scan, not semantic search or Korean morphological analysis."""
    def __init__(self, blocks):
        self.blocks=blocks

    def retrieve(self, query, limit=4):
        tokens=query_tokens(query)
        if not tokens:
            return []
        ranked=[]
        for block in self.blocks:
            text=block['text']
            # Non-overlapping source slices preserve exact offsets and cover the entire block.
            for start in range(0,len(text),1000):
                end=min(start+1200,len(text))
                excerpt=text[start:end]
                matches=sum(token in excerpt.lower() for token in tokens)
                if matches:
                    ranked.append(Candidate(block['document_id'],block['document_id'],block['block_id'],
                                            block['title'],block['locator'],excerpt,start,end,matches/len(tokens)))
        ranked.sort(key=lambda c:(-c.retrieval_score,c.document_id,c.block_id,c.start))
        selected=[]
        seen_docs=set()
        for candidate in ranked:
            if candidate.document_id in seen_docs:
                continue
            selected.append(candidate)
            seen_docs.add(candidate.document_id)
            if len(selected)>=limit:
                return selected
        for candidate in ranked:
            if candidate not in selected:
                selected.append(candidate)
            if len(selected)>=limit:
                break
        return selected
