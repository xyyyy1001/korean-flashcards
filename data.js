// Korean Vocabulary Starter Decks
const VOCABULARY_DATA = {
    decks: [
        {
            id: "basics",
            name: "Basics & Greetings",
            cards: [
                { korean: "안녕하세요", english: "Hello (formal)", romanization: "annyeonghaseyo", example: "안녕하세요, 만나서 반갑습니다." },
                { korean: "감사합니다", english: "Thank you (formal)", romanization: "gamsahamnida", example: "도와주셔서 감사합니다." },
                { korean: "네", english: "Yes", romanization: "ne", example: "네, 알겠습니다." },
                { korean: "아니요", english: "No", romanization: "aniyo", example: "아니요, 괜찮습니다." },
                { korean: "죄송합니다", english: "I'm sorry (formal)", romanization: "joesonghamnida", example: "늦어서 죄송합니다." },
                { korean: "안녕히 가세요", english: "Goodbye (to person leaving)", romanization: "annyeonghi gaseyo", example: "내일 봐요. 안녕히 가세요!" },
                { korean: "안녕히 계세요", english: "Goodbye (to person staying)", romanization: "annyeonghi gyeseyo", example: "저 먼저 갈게요. 안녕히 계세요!" },
                { korean: "잘 지내세요?", english: "How are you?", romanization: "jal jinaeseyo?", example: "오랜만이에요! 잘 지내세요?" },
                { korean: "만나서 반갑습니다", english: "Nice to meet you", romanization: "mannaseo bangapseumnida", example: "처음 뵙겠습니다. 만나서 반갑습니다." },
                { korean: "실례합니다", english: "Excuse me", romanization: "sillyehamnida", example: "실례합니다, 길 좀 물어봐도 될까요?" },
            ]
        },
        {
            id: "numbers",
            name: "Numbers (1-10)",
            cards: [
                { korean: "하나", english: "One (native)", romanization: "hana", example: "하나, 둘, 셋!" },
                { korean: "둘", english: "Two (native)", romanization: "dul", example: "사과 둘 주세요." },
                { korean: "셋", english: "Three (native)", romanization: "set", example: "셋까지 세겠습니다." },
                { korean: "넷", english: "Four (native)", romanization: "net", example: "의자가 넷 있어요." },
                { korean: "다섯", english: "Five (native)", romanization: "daseot", example: "다섯 시에 만나요." },
                { korean: "여섯", english: "Six (native)", romanization: "yeoseot", example: "여섯 명이 왔어요." },
                { korean: "일곱", english: "Seven (native)", romanization: "ilgop", example: "일곱 시에 일어나요." },
                { korean: "여덟", english: "Eight (native)", romanization: "yeodeol", example: "여덟 개 샀어요." },
                { korean: "아홉", english: "Nine (native)", romanization: "ahop", example: "아홉 번 시도했어요." },
                { korean: "열", english: "Ten (native)", romanization: "yeol", example: "열 분만 기다려 주세요." },
            ]
        },
        {
            id: "food",
            name: "Food & Drink",
            cards: [
                { korean: "밥", english: "Rice / Meal", romanization: "bap", example: "밥 먹었어요?" },
                { korean: "물", english: "Water", romanization: "mul", example: "물 한 잔 주세요." },
                { korean: "커피", english: "Coffee", romanization: "keopi", example: "아이스 커피 하나요." },
                { korean: "고기", english: "Meat", romanization: "gogi", example: "고기를 좋아해요." },
                { korean: "김치", english: "Kimchi", romanization: "gimchi", example: "김치가 맛있어요." },
                { korean: "라면", english: "Ramen / Instant noodles", romanization: "ramyeon", example: "라면 먹을래요?" },
                { korean: "맛있다", english: "Delicious", romanization: "masitda", example: "이 음식 정말 맛있다!" },
                { korean: "배고파요", english: "I'm hungry", romanization: "baegopayo", example: "배고파요, 뭐 먹을까요?" },
                { korean: "맥주", english: "Beer", romanization: "maekju", example: "맥주 한 잔 할까요?" },
                { korean: "과일", english: "Fruit", romanization: "gwail", example: "과일 좋아하세요?" },
            ]
        },
        {
            id: "daily",
            name: "Daily Expressions",
            cards: [
                { korean: "좋아요", english: "Good / I like it", romanization: "joayo", example: "이거 좋아요!" },
                { korean: "싫어요", english: "I don't like it", romanization: "sireoyo", example: "그건 싫어요." },
                { korean: "모르겠어요", english: "I don't know", romanization: "moreugesseoyo", example: "잘 모르겠어요." },
                { korean: "알겠습니다", english: "I understand", romanization: "algesseumnida", example: "네, 알겠습니다." },
                { korean: "잠깐만요", english: "Wait a moment", romanization: "jamkkanmanyo", example: "잠깐만요, 거의 다 됐어요." },
                { korean: "어디에요?", english: "Where is it?", romanization: "eodieyo?", example: "화장실 어디에요?" },
                { korean: "얼마예요?", english: "How much is it?", romanization: "eolmayeyo?", example: "이거 얼마예요?" },
                { korean: "도와주세요", english: "Please help me", romanization: "dowajuseyo", example: "도와주세요, 길을 잃었어요." },
                { korean: "괜찮아요", english: "It's okay", romanization: "gwaenchanayo", example: "괜찮아요, 걱정 마세요." },
                { korean: "화이팅", english: "You can do it! / Fighting!", romanization: "hwaiting", example: "시험 화이팅!" },
            ]
        },
        {
            id: "verbs",
            name: "Common Verbs",
            cards: [
                { korean: "가다", english: "To go", romanization: "gada", example: "학교에 가요." },
                { korean: "오다", english: "To come", romanization: "oda", example: "여기로 오세요." },
                { korean: "먹다", english: "To eat", romanization: "meokda", example: "점심 먹었어요?" },
                { korean: "마시다", english: "To drink", romanization: "masida", example: "커피 마실래요?" },
                { korean: "하다", english: "To do", romanization: "hada", example: "뭐 하고 있어요?" },
                { korean: "보다", english: "To see / watch", romanization: "boda", example: "영화 보러 갈래요?" },
                { korean: "읽다", english: "To read", romanization: "ikda", example: "책을 읽고 있어요." },
                { korean: "쓰다", english: "To write", romanization: "sseuda", example: "편지를 쓰고 있어요." },
                { korean: "배우다", english: "To learn", romanization: "baeuda", example: "한국어를 배우고 있어요." },
                { korean: "좋아하다", english: "To like", romanization: "joahada", example: "음악을 좋아해요." },
            ]
        },
    ]
};
