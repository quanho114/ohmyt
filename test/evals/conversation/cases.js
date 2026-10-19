// Intent differs with history; these inputs are evaluation data, not runtime rules.
export const cases=[
  {id:'social-in-project',history:[['user','Tìm hiểu dự án'],['agent','Đã tóm tắt README và cách chạy dự án.']],prompt:'Lâu rồi mới gặp, dạo này thế nào?',expect:'conversation'},
  {id:'topic-shift',history:[['user','Review code'],['agent','Có thể thêm kiểm tra cho parser.']],prompt:'Tạm gác code nhé. Theo bạn, làm sao cân bằng công việc và nghỉ ngơi?',expect:'conversation'},
  {id:'acknowledge-completed',history:[['user','Tóm tắt README'],['agent','Đã xong bản tóm tắt, không có công việc còn lại.']],prompt:'Được.',expect:'conversation'},
  {id:'accept-pending-read',history:[['user','Mình chưa biết repo này làm gì.'],['agent','Mình có thể đọc README.md trong project rồi giải thích ngắn gọn. Bạn muốn mình làm vậy không?']],prompt:'Được.',expect:'read'},
  {id:'accept-pending-discussion',history:[['user','Mình muốn nghe một cách nhìn khác về làm việc từ xa.'],['agent','Mình có thể phân tích những đánh đổi về tập trung và kết nối đồng nghiệp. Bạn muốn nghe không?']],prompt:'Được.',expect:'conversation'},
  {id:'read-with-social-preface',history:[],prompt:'Ça fait plaisir de te revoir. Peux-tu lire README.md et expliquer à quoi sert ce projet ?',expect:'read'},
  {id:'greeting-after-completed',history:[['user','Tìm hiểu dự án'],['agent','Đã tóm tắt README và cách chạy dự án. Không còn việc nào đang dở.']],prompt:'ê',expect:'conversation'},
  {id:'ambiguous-reference',history:[['user','Mình đang cân nhắc hai thay đổi: sửa parser và đổi theme.'],['agent','Hai việc độc lập, mình chưa biết bạn muốn chọn việc nào.']],prompt:'Làm cái đó đi.',expect:'clarify'},
  {id:'translation-not-action',history:[],prompt:'Dịch nguyên câu này sang tiếng Việt, chỉ trả bản dịch: I will check the author.',expect:'conversation'},
];
